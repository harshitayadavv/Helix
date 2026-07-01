"""
Pydantic models representing parsed code entities (the output of the
tree-sitter AST parser) and the graph schema (nodes / relationships)
persisted to Neo4j.
"""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    FILE = "File"
    FUNCTION = "Function"
    CLASS = "Class"
    MODULE = "Module"


class RelationshipType(str, Enum):
    IMPORTS = "IMPORTS"
    CALLS = "CALLS"
    INHERITS = "INHERITS"
    CONTAINS = "CONTAINS"


class FunctionInfo(BaseModel):
    id: str  # stable id, e.g. "{file_path}::{name}::{start_line}"
    name: str
    start_line: int
    end_line: int
    parameters: List[str] = Field(default_factory=list)
    is_async: bool = False
    is_method: bool = False
    docstring: Optional[str] = None
    calls: List[str] = Field(default_factory=list)  # names of functions called within this function


class ClassInfo(BaseModel):
    id: str
    name: str
    start_line: int
    end_line: int
    bases: List[str] = Field(default_factory=list)  # parent class names
    methods: List[FunctionInfo] = Field(default_factory=list)
    docstring: Optional[str] = None


class ImportInfo(BaseModel):
    module: str  # imported module / path as written in source
    names: List[str] = Field(default_factory=list)  # imported symbols (empty = whole module)
    alias: Optional[str] = None
    is_relative: bool = False
    line: int


class ExportInfo(BaseModel):
    name: str
    line: int


class ParsedFile(BaseModel):
    path: str  # path relative to the repository root
    language: str
    functions: List[FunctionInfo] = Field(default_factory=list)
    classes: List[ClassInfo] = Field(default_factory=list)
    imports: List[ImportInfo] = Field(default_factory=list)
    exports: List[ExportInfo] = Field(default_factory=list)
    loc: int = 0
    error: Optional[str] = None


class GraphNode(BaseModel):
    id: str
    type: NodeType
    properties: dict = Field(default_factory=dict)


class GraphRelationship(BaseModel):
    type: RelationshipType
    start_id: str
    end_id: str
    properties: dict = Field(default_factory=dict)
