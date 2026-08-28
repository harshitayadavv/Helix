"""
Multi-language AST parsing built on tree-sitter.

Supports: Python, JavaScript, TypeScript, Java, C++.
Extracts: functions, classes (with methods/bases), imports, exports, calls.

Parsing is CPU-bound, so the public async entrypoint offloads the
actual tree-sitter work to a worker thread via asyncio.to_thread,
keeping the event loop free for I/O elsewhere in the pipeline.

IMPORTANT: capture correlation
-------------------------------
`Query.captures(node)` returns captures grouped *by capture name across
the entire tree* — it does NOT guarantee that `captures["a"][i]` and
`captures["b"][i]` belong to the same match. Zipping those lists
together silently produces mismatched (name, node) pairs.

`Query.matches(node)` instead returns one entry per match, each with
its own small dict of captures that genuinely belong together. All
extraction below is therefore built on `.matches()`.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from tree_sitter import Language, Node, Parser, Query

from app.core.parser.language_detector import detect_language
from app.models.graph import ClassInfo, ExportInfo, FunctionInfo, ImportInfo, ParsedFile

logger = logging.getLogger("helix.ast_parser")


# --------------------------------------------------------------------------
# Tree-sitter language loading
# --------------------------------------------------------------------------

def _load_language(module_name: str) -> Optional[Language]:
    try:
        module = __import__(module_name)
        return Language(module.language())
    except Exception:
        logger.exception("Failed to load tree-sitter language module: %s", module_name)
        return None


def _load_typescript_language() -> Optional[Language]:
    try:
        import tree_sitter_typescript as tsts
        return Language(tsts.language_typescript())
    except Exception:
        logger.exception("Failed to load tree-sitter-typescript.")
        return None

def _load_tsx_language() -> Optional[Language]:
    try:
        import tree_sitter_typescript as tsts
        return Language(tsts.language_tsx())
    except Exception:
        logger.exception("Failed to load tree-sitter-typescript (TSX grammar).")
        return None

@dataclass
class _Queries:
    function: Optional[Query]
    klass: Optional[Query]
    imp: Optional[Query]
    call: Optional[Query]


@dataclass
class _LangConfig:
    language: Language
    queries: _Queries


_QUERY_STRINGS: Dict[str, Dict[str, str]] = {
    "python": {
        "function": "(function_definition name: (identifier) @function.name) @function.node",
        "class": "(class_definition name: (identifier) @class.name) @class.node",
        "import": "[ (import_statement) @import.node (import_from_statement) @import.node ]",
        "call": (
            "(call function: ["
            "  (identifier) @call.name "
            "  (attribute attribute: (identifier) @call.name)"
            "]) @call.node"
        ),
    },
    "javascript": {
        "function": (
            "[ "
            "(function_declaration name: (identifier) @function.name) @function.node "
            "(method_definition name: (property_identifier) @function.name) @function.node "
            # NOTE: @function.node is bound to the arrow_function/function_expression
            # *value* itself, not the outer variable_declarator — otherwise params,
            # body and async-detection would all look at the wrong node.
            "(variable_declarator name: (identifier) @function.name value: (arrow_function) @function.node) "
            "(variable_declarator name: (identifier) @function.name value: (function_expression) @function.node) "
            "]"
        ),
        # JS class names are plain `identifier` nodes.
        "class": "(class_declaration name: (identifier) @class.name) @class.node",
        "import": "(import_statement) @import.node",
        "call": (
            "[ "
            "(call_expression function: ["
            "    (identifier) @call.name "
            "    (member_expression property: (property_identifier) @call.name)"
            "  ]) @call.node "
            "(new_expression constructor: (identifier) @call.name) @call.node "
            "]"
        ),
    },
    "java": {
        "function": "(method_declaration name: (identifier) @function.name) @function.node",
        "class": "(class_declaration name: (identifier) @class.name) @class.node",
        "import": "(import_declaration) @import.node",
        "call": "(method_invocation name: (identifier) @call.name) @call.node",
    },
    "cpp": {
        "function": (
            "(function_definition declarator: (function_declarator "
            "  declarator: (identifier) @function.name)) @function.node"
        ),
        "class": (
            "[ "
            "(class_specifier name: (type_identifier) @class.name) @class.node "
            "(struct_specifier name: (type_identifier) @class.name) @class.node "
            "]"
        ),
        "import": "(preproc_include) @import.node",
        "call": (
            "[ "
            "(call_expression function: ["
            "    (identifier) @call.name "
            "    (field_expression field: (field_identifier) @call.name)"
            "  ]) @call.node "
            "(new_expression type: (type_identifier) @call.name) @call.node "
            "]"
        ),
    },
}
# TypeScript reuses most of the JS grammar shapes, but class *names* are
# typed as `type_identifier` (not `identifier`) because a class name also
# denotes a type in TS. Everything else is shared with JavaScript.
_QUERY_STRINGS["typescript"] = {
    **_QUERY_STRINGS["javascript"],
    "class": "(class_declaration name: (type_identifier) @class.name) @class.node",
}
# TSX is a distinct tree-sitter grammar from plain TypeScript (it adds JSX
# node types), but function/class/import/call node shapes are identical,
# so it can safely reuse TypeScript's query strings.
_QUERY_STRINGS["tsx"] = _QUERY_STRINGS["typescript"]

_registry: Dict[str, _LangConfig] = {}


def _build_registry() -> Dict[str, _LangConfig]:
    global _registry
    if _registry:
        return _registry

    loaders = {
        "python": lambda: _load_language("tree_sitter_python"),
        "javascript": lambda: _load_language("tree_sitter_javascript"),
        "typescript": _load_typescript_language,
        "tsx": _load_tsx_language,
        "java": lambda: _load_language("tree_sitter_java"),
        "cpp": lambda: _load_language("tree_sitter_cpp"),
    }

    for lang_name, loader in loaders.items():
        language = loader()
        if language is None:
            logger.warning("Language '%s' unavailable; parsing for it will be skipped.", lang_name)
            continue
        try:
            qs = _QUERY_STRINGS[lang_name]
            queries = _Queries(
                function=language.query(qs["function"]),
                klass=language.query(qs["class"]),
                imp=language.query(qs["import"]),
                call=language.query(qs["call"]),
            )
            _registry[lang_name] = _LangConfig(language=language, queries=queries)
        except Exception:
            logger.exception("Failed compiling tree-sitter queries for '%s'.", lang_name)

    return _registry


def _matches(query: Optional[Query], node: Node) -> List[Dict[str, Node]]:
    """
    Run a query and return one flat {capture_name: Node} dict per match,
    in document order. This is the *only* correct way to correlate
    captures that belong together (see module docstring).

    None of our queries capture the same name twice within a single
    match, so collapsing each capture list to its first node is safe.
    """
    if query is None:
        return []
    flattened: List[Dict[str, Node]] = []
    for _pattern_index, capture_dict in query.matches(node):
        flat = {name: nodes[0] for name, nodes in capture_dict.items() if nodes}
        flattened.append(flat)
    return flattened


def _text(node: Node, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _has_async_child(node: Node) -> bool:
    return any(child.type == "async" for child in node.children)


def _first_identifier(node: Node) -> Optional[Node]:
    if node.type in ("identifier", "property_identifier", "type_identifier"):
        return node
    for child in node.children:
        found = _first_identifier(child)
        if found is not None:
            return found
    return None


def _param_name_node(p: Node) -> Optional[Node]:
    """
    Find the identifier that names a single parameter node.

    Different grammars expose the parameter name under different field
    names (Java/Python typed_default_parameter: "name", C++: "declarator",
    TypeScript: "pattern"), and critically the *type* sits on the
    opposite side of the name in different languages (Java/C++ put the
    type first, Python/TS put it after). A positional "first
    identifier-like child wins" scan would grab the type instead of the
    name for Java/C++, so named fields are tried first; the positional
    scan is only a fallback for grammars with no such field (e.g.
    Python's plain `typed_parameter`, where the name is always the very
    first child).
    """
    for field in ("name", "declarator", "pattern"):
        named = p.child_by_field_name(field)
        if named is not None:
            return _first_identifier(named) if named.type not in ("identifier", "property_identifier", "type_identifier") else named
    for child in p.children:
        if child.type in ("identifier", "property_identifier", "type_identifier"):
            return child
    return _first_identifier(p)


def _find_param_container(func_node: Node) -> Optional[Node]:
    """
    Locate the node holding a function's parameter list.

    Python/JS/Java expose `parameters` / `formal_parameters` as a direct
    child of the function node. C++ nests it one level deeper, inside an
    intermediate `function_declarator` (e.g. `function_definition ->
    function_declarator -> parameter_list`), so that wrapper is checked
    as a fallback.
    """
    for child in func_node.children:
        if child.type in ("parameters", "formal_parameters", "parameter_list"):
            return child
    for child in func_node.children:
        if child.type == "function_declarator":
            for grandchild in child.children:
                if grandchild.type in ("parameters", "formal_parameters", "parameter_list"):
                    return grandchild
    return None


def _extract_params(func_node: Node, source: bytes) -> List[str]:
    container = _find_param_container(func_node)
    if container is None:
        return []
    params: List[str] = []
    for p in container.children:
        if p.type in (
            "identifier", "typed_parameter", "default_parameter", "typed_default_parameter",
            "required_parameter", "optional_parameter", "formal_parameter", "parameter_declaration",
        ):
            name_node = p if p.type == "identifier" else _param_name_node(p)
            if name_node is not None:
                params.append(_text(name_node, source))
    return params


def _extract_docstring(body_node: Optional[Node], source: bytes) -> Optional[str]:
    if body_node is None:
        return None
    for child in body_node.children:
        if child.type == "expression_statement":
            for grandchild in child.children:
                if grandchild.type == "string":
                    return _text(grandchild, source).strip("\"'")[:500]
        if child.type == "string":
            return _text(child, source).strip("\"'")[:500]
        break  # only the first statement counts as a docstring candidate
    return None


def _extract_bases(class_node: Node, source: bytes, language: str) -> List[str]:
    bases: List[str] = []
    if language == "python":
        for child in class_node.children:
            if child.type == "argument_list":
                for arg in child.named_children:
                    bases.append(_text(arg, source))
    elif language in ("javascript", "typescript"):
        for child in class_node.children:
            if child.type != "class_heritage":
                continue
            for c in child.children:
                if c.type in ("extends_clause", "implements_clause"):
                    # TypeScript wraps each base in its own clause node.
                    for grandchild in c.children:
                        if grandchild.type in ("identifier", "type_identifier"):
                            bases.append(_text(grandchild, source))
                elif c.type in ("identifier", "type_identifier"):
                    # Plain JS exposes `extends Foo` flat: ['extends', 'identifier'].
                    bases.append(_text(c, source))
    elif language == "java":
        for child in class_node.children:
            if child.type in ("superclass", "super_interfaces"):
                bases.append(_text(child, source).replace("extends", "").strip())
    elif language == "cpp":
        for child in class_node.children:
            if child.type == "base_class_clause":
                bases.extend(_text(c, source) for c in child.children if c.type == "type_identifier")
    return [b for b in bases if b]


def _calls_within(call_matches: List[Dict[str, Node]], start_byte: int, end_byte: int, source: bytes) -> List[str]:
    names: List[str] = []
    seen = set()
    for match in call_matches:
        call_node = match.get("call.node")
        name_node = match.get("call.name")
        if call_node is None or name_node is None:
            continue
        if start_byte <= call_node.start_byte and call_node.end_byte <= end_byte:
            name = _text(name_node, source)
            if name not in seen:
                seen.add(name)
                names.append(name)
    return names


def _find_body(node: Node) -> Optional[Node]:
    return next(
        (c for c in node.children if c.type in (
            "block", "statement_block", "compound_statement", "class_body", "field_declaration_list",
        )),
        None,
    )


class ASTParser:
    """Parses source files into a normalized ParsedFile representation."""

    def __init__(self) -> None:
        self._registry = _build_registry()

    def supported_languages(self) -> List[str]:
        return list(self._registry.keys())

    def parse_source(self, language: str, source_code: str, file_path: str) -> ParsedFile:
        config = self._registry.get(language)
        if config is None:
            return ParsedFile(path=file_path, language=language, error=f"Unsupported or unavailable language: {language}")

        source = source_code.encode("utf-8", errors="replace")
        parser = Parser(config.language)

        try:
            tree = parser.parse(source)
        except Exception as exc:
            logger.exception("tree-sitter failed to parse %s", file_path)
            return ParsedFile(path=file_path, language=language, error=str(exc))

        root = tree.root_node
        queries = config.queries

        try:
            call_matches = _matches(queries.call, root)
            class_matches = _matches(queries.klass, root)
            func_matches = _matches(queries.function, root)

            class_ranges = [
                (m["class.node"].start_byte, m["class.node"].end_byte)
                for m in class_matches if "class.node" in m
            ]

            classes = self._build_classes(class_matches, func_matches, call_matches, source, language, file_path)
            functions = self._build_top_level_functions(func_matches, call_matches, source, file_path, class_ranges)
            imports = self._extract_imports(queries, root, source, language)
            exports = self._extract_exports(root, source, language)
        except Exception as exc:
            logger.exception("Error extracting entities from %s", file_path)
            return ParsedFile(path=file_path, language=language, error=str(exc))

        loc = source_code.count("\n") + 1
        return ParsedFile(
            path=file_path, language=language, functions=functions,
            classes=classes, imports=imports, exports=exports, loc=loc,
        )

    async def parse_file_async(self, file_path: str, source_code: str, language: Optional[str] = None) -> ParsedFile:
        lang = language or detect_language(file_path)
        if lang is None:
            return ParsedFile(path=file_path, language="unknown", error="Could not detect language.")
        return await asyncio.to_thread(self.parse_source, lang, source_code, file_path)

    # -- internal extraction helpers -----------------------------------

    @staticmethod
    def _build_top_level_functions(
        func_matches: List[Dict[str, Node]],
        call_matches: List[Dict[str, Node]],
        source: bytes,
        file_path: str,
        exclude_ranges: List[Tuple[int, int]],
    ) -> List[FunctionInfo]:
        functions: List[FunctionInfo] = []

        for match in func_matches:
            func_node = match.get("function.node")
            name_node = match.get("function.name")
            if func_node is None or name_node is None:
                continue
            if any(start <= func_node.start_byte and func_node.end_byte <= end for start, end in exclude_ranges):
                continue  # already accounted for as a class method

            name = _text(name_node, source)
            body = _find_body(func_node)
            functions.append(
                FunctionInfo(
                    id=f"{file_path}::{name}::{func_node.start_point[0] + 1}",
                    name=name,
                    start_line=func_node.start_point[0] + 1,
                    end_line=func_node.end_point[0] + 1,
                    parameters=_extract_params(func_node, source),
                    is_async=_has_async_child(func_node),
                    is_method=func_node.type in ("method_definition", "method_declaration"),
                    docstring=_extract_docstring(body, source),
                    calls=_calls_within(call_matches, func_node.start_byte, func_node.end_byte, source),
                )
            )
        return functions

    @staticmethod
    def _build_classes(
        class_matches: List[Dict[str, Node]],
        func_matches: List[Dict[str, Node]],
        call_matches: List[Dict[str, Node]],
        source: bytes,
        language: str,
        file_path: str,
    ) -> List[ClassInfo]:
        classes: List[ClassInfo] = []

        for cmatch in class_matches:
            class_node = cmatch.get("class.node")
            class_name_node = cmatch.get("class.name")
            if class_node is None or class_name_node is None:
                continue

            name = _text(class_name_node, source)
            methods: List[FunctionInfo] = []

            for fmatch in func_matches:
                fn_node = fmatch.get("function.node")
                fn_name_node = fmatch.get("function.name")
                if fn_node is None or fn_name_node is None:
                    continue
                if class_node.start_byte <= fn_node.start_byte and fn_node.end_byte <= class_node.end_byte:
                    fn_name = _text(fn_name_node, source)
                    body = _find_body(fn_node)
                    methods.append(
                        FunctionInfo(
                            id=f"{file_path}::{name}.{fn_name}::{fn_node.start_point[0] + 1}",
                            name=fn_name,
                            start_line=fn_node.start_point[0] + 1,
                            end_line=fn_node.end_point[0] + 1,
                            parameters=_extract_params(fn_node, source),
                            is_async=_has_async_child(fn_node),
                            is_method=True,
                            docstring=_extract_docstring(body, source),
                            calls=_calls_within(call_matches, fn_node.start_byte, fn_node.end_byte, source),
                        )
                    )

            class_body = _find_body(class_node)
            classes.append(
                ClassInfo(
                    id=f"{file_path}::{name}::{class_node.start_point[0] + 1}",
                    name=name,
                    start_line=class_node.start_point[0] + 1,
                    end_line=class_node.end_point[0] + 1,
                    bases=_extract_bases(class_node, source, language),
                    methods=methods,
                    docstring=_extract_docstring(class_body, source),
                )
            )
        return classes

    @staticmethod
    def _extract_imports(queries: _Queries, root: Node, source: bytes, language: str) -> List[ImportInfo]:
        imports: List[ImportInfo] = []
        for match in _matches(queries.imp, root):
            node = match.get("import.node")
            if node is None:
                continue
            raw_text = _text(node, source)
            line = node.start_point[0] + 1
            module, names, alias, is_relative = ASTParser._parse_import_text(raw_text, language)
            imports.append(ImportInfo(module=module, names=names, alias=alias, is_relative=is_relative, line=line))
        return imports

    @staticmethod
    def _parse_import_text(raw_text: str, language: str) -> Tuple[str, List[str], Optional[str], bool]:
        text = raw_text.strip().rstrip(";")
        if language == "python":
            if text.startswith("from "):
                rest = text[5:]
                module, _, names_part = rest.partition(" import ")
                module = module.strip()
                names = [n.strip().split(" as ")[0] for n in names_part.split(",") if n.strip()]
                return module, names, None, module.startswith(".")
            if text.startswith("import "):
                rest = text[7:]
                parts = rest.split(",")[0].strip()
                module, _, alias = parts.partition(" as ")
                return module.strip(), [], (alias.strip() or None), False
        elif language in ("javascript", "typescript"):
            if "from" in text:
                module = text.rsplit("from", 1)[-1].strip().strip("\"';")
                names_part = text.split("from")[0].replace("import", "").strip()
                names = [n.strip() for n in names_part.strip("{} ").split(",") if n.strip()]
                return module, names, None, module.startswith(".")
            module = text.replace("import", "").strip().strip("\"';()")
            return module, [], None, module.startswith(".")
        elif language == "java":
            module = text.replace("import", "").replace("static", "").strip()
            return module, [], None, False
        elif language == "cpp":
            module = text.replace("#include", "").strip().strip("<>\"")
            return module, [], None, module.startswith(".")
        return text, [], None, False

    @staticmethod
    def _extract_exports(root: Node, source: bytes, language: str) -> List[ExportInfo]:
        exports: List[ExportInfo] = []
        if language not in ("javascript", "typescript"):
            return exports

        def walk(node: Node) -> None:
            if node.type == "export_statement":
                name_node = _first_identifier(node)
                if name_node is not None:
                    exports.append(ExportInfo(name=_text(name_node, source), line=node.start_point[0] + 1))
            for child in node.children:
                walk(child)

        walk(root)
        return exports


ast_parser = ASTParser()
