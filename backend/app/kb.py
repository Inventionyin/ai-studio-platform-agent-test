from __future__ import annotations

import re
from typing import Any

from .logic import now_label, uid
from .parsing import chunk_text
from .store import Store, store


def terms(text: str) -> list[str]:
    lowered = text.lower()
    words = re.findall(r"[a-z0-9_]+", lowered)
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", lowered))
    bigrams = [chinese[index:index + 2] for index in range(max(0, len(chinese) - 1))]
    single = list(chinese) if len(chinese) <= 2 else []
    return list(dict.fromkeys(words + bigrams + single))


def delete_chunks(db: Store, project_id: str, doc_id: str) -> None:
    for chunk in db.all("kbChunks", project_id):
        if chunk.get("docId") == doc_id:
            db.delete("kbChunks", chunk["id"])


def index_text(db: Store, project_id: str, kb_id: str, doc_id: str, text: str) -> int:
    delete_chunks(db, project_id, doc_id)
    chunks = chunk_text(text, size=900, overlap=80)
    for index, content in enumerate(chunks, start=1):
        if not content.strip():
            continue
        chunk_id = uid("CH")
        db.put("kbChunks", chunk_id, {
            "id": chunk_id,
            "projectId": project_id,
            "kbId": kb_id,
            "docId": doc_id,
            "index": index,
            "content": content.strip()[:4000],
            "createdAt": now_label(),
        })
    return len(chunks)


def search(project_id: str, query: str, top_k: int = 5, kb_id: str | None = None) -> list[dict[str, Any]]:
    query_terms = terms(query)
    if not query_terms:
        return []
    hits = []
    for chunk in store.all("kbChunks", project_id):
        if kb_id and chunk.get("kbId") != kb_id:
            continue
        content = chunk.get("content", "")
        lowered = content.lower()
        matches = sum(lowered.count(term) for term in query_terms)
        if matches == 0:
            continue
        score = round(matches / (matches + 3), 2)
        doc = store.get("kbDocs", chunk["docId"], project_id) or {}
        hits.append({
            "doc": doc.get("filename", chunk["docId"]),
            "chunkIndex": chunk.get("index", 0),
            "content": content[:800],
            "score": score,
        })
    hits.sort(key=lambda item: item["score"], reverse=True)
    return hits[: max(1, min(top_k, 20))]
