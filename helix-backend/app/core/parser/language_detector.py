"""
Detects the programming language of a source file from its file
extension, and flags paths that should be skipped during ingestion
(vendored code, build artifacts, VCS metadata, etc).
"""
from pathlib import Path
from typing import Optional

EXTENSION_LANGUAGE_MAP = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".hh": "cpp",
    ".h": "cpp",
    ".c": "cpp",  # tree-sitter-cpp parses plain C reasonably well
}

IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", "target", ".idea", ".vscode", "vendor",
    ".mypy_cache", ".pytest_cache", "coverage", ".next", "egg-info",
}

SUPPORTED_LANGUAGES = {"python", "javascript", "typescript", "java", "cpp"}


def detect_language(file_path: str) -> Optional[str]:
    """Return the language identifier for a file path, or None if unsupported."""
    ext = Path(file_path).suffix.lower()
    return EXTENSION_LANGUAGE_MAP.get(ext)


def is_ignored_path(path: str) -> bool:
    parts = Path(path).parts
    return any(part in IGNORED_DIRS for part in parts)


def is_supported_file(file_path: str) -> bool:
    if is_ignored_path(file_path):
        return False
    return detect_language(file_path) in SUPPORTED_LANGUAGES
