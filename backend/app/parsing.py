from __future__ import annotations

import re
from pathlib import Path

import pymupdf
from docx import Document as DocxDocument

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".md", ".markdown", ".txt"}


def safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", filename).strip("._")
    return cleaned or "document"


def extract_text(path: str | Path, filename: str | None = None) -> str:
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        parts = []
        with pymupdf.open(file_path) as document:
            for page in document:
                parts.append(page.get_text("text"))
        return "\n".join(parts).strip()
    if suffix == ".docx":
        document = DocxDocument(file_path)
        parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
        return "\n".join(parts).strip()
    if suffix in {".md", ".markdown", ".txt"}:
        return file_path.read_text(encoding="utf-8", errors="ignore").strip()
    raise ValueError(f"不支持的文件类型：{filename or file_path.name}")


def chunk_text(text: str, size: int = 12000, overlap: int = 500) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks
