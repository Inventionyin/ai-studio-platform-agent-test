from __future__ import annotations

import secrets
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import project_editor_scope, project_scope
from ..config import settings
from ..kb import delete_chunks, index_text, search
from ..llm import LLMError, LLMUnavailable, chat_text
from ..logic import now_label, uid, workflow_run
from ..parsing import SUPPORTED_EXTENSIONS, extract_text, safe_filename
from ..response import ok
from ..schemas import (
    ChatConfigModel, ChatSend, ConversationCreate, KbCreate, RecallRequest, RenameRequest,
    WorkflowRunRequest, WorkflowSave,
)
from ..store import store

router = APIRouter()
UPLOAD_ROOT = Path(settings.upload_dir).resolve()


def doc_public(doc: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in doc.items() if key != "storedPath"}


def refresh_kb_counts(pid: str, kb_id: str) -> None:
    kb = store.get("kbs", kb_id, pid)
    if not kb:
        return
    kb["docs"] = len([item for item in store.all("kbDocs", pid) if item.get("kbId") == kb_id])
    kb["chunks"] = len([item for item in store.all("kbChunks", pid) if item.get("kbId") == kb_id])
    kb["updatedAt"] = now_label()
    store.put("kbs", kb_id, kb)


def must_doc(collection: str, doc_id: str, pid: str) -> dict[str, Any]:
    item = store.get(collection, doc_id, pid)
    if not item:
        raise HTTPException(404, f"{collection} 不存在: {doc_id}")
    return item


# ---------------- knowledge ----------------
@router.get("/knowledge")
def list_knowledge(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("kbs", pid))


@router.post("/knowledge")
def create_knowledge(body: KbCreate, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    kb = {
        "id": uid("KB"), "projectId": pid, **body.model_dump(),
        "docs": 0, "chunks": 0, "status": "已完成", "updatedAt": now_label(),
    }
    store.put("kbs", kb["id"], kb)
    return ok(kb)


@router.delete("/knowledge/{kb_id}")
def delete_knowledge(kb_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    must_doc("kbs", kb_id, pid)
    store.delete("kbs", kb_id)
    for doc in store.all("kbDocs", pid):
        if doc.get("kbId") == kb_id:
            delete_chunks(store, pid, doc["id"])
            store.delete("kbDocs", doc["id"])
    return ok(None)


@router.get("/knowledge/docs")
def list_kb_docs(kbId: str | None = None, pid: str = Depends(project_scope)) -> dict[str, Any]:
    items = store.all("kbDocs", pid)
    if kbId:
        items = [item for item in items if item.get("kbId") == kbId]
    return ok([doc_public(item) for item in items])


@router.post("/knowledge/docs")
async def upload_kb_doc(
    kbId: str = Form(...),
    file: UploadFile = File(...),
    pid: str = Depends(project_editor_scope),
) -> dict[str, Any]:
    must_doc("kbs", kbId, pid)
    filename = safe_filename(file.filename or "document")
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型：{filename}")
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"文件超过 {settings.max_upload_mb}MB")
    folder = UPLOAD_ROOT / pid / "kb" / kbId
    folder.mkdir(parents=True, exist_ok=True)
    stored = folder / f"{secrets.token_hex(8)}{suffix}"
    stored.write_bytes(content)
    try:
        text = extract_text(stored, filename)
    except Exception as exc:  # noqa: BLE001 - parser failure is returned to the uploader
        stored.unlink(missing_ok=True)
        raise HTTPException(400, f"解析失败：{exc}") from exc
    doc = {
        "id": uid("DOC"),
        "projectId": pid,
        "kbId": kbId,
        "filename": file.filename or filename,
        "size": len(content),
        "mime": file.content_type or "",
        "storedPath": str(stored.relative_to(UPLOAD_ROOT)),
        "parseStatus": "已解析",
        "chunks": 0,
        "uploadedAt": now_label(),
    }
    doc["chunks"] = index_text(store, pid, kbId, doc["id"], text)
    store.put("kbDocs", doc["id"], doc)
    refresh_kb_counts(pid, kbId)
    return ok(doc_public(doc))


@router.post("/knowledge/docs/{doc_id}/reparse")
def reparse_kb_doc(doc_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    doc = must_doc("kbDocs", doc_id, pid)
    stored_path = doc.get("storedPath")
    if not stored_path:
        raise HTTPException(400, "源文件不存在，请重新上传")
    path = (UPLOAD_ROOT / stored_path).resolve()
    if UPLOAD_ROOT not in path.parents or not path.exists():
        raise HTTPException(400, "源文件已丢失，请重新上传")
    text = extract_text(path, doc["filename"])
    doc["chunks"] = index_text(store, pid, doc["kbId"], doc_id, text)
    doc["parseStatus"] = "已解析"
    store.put("kbDocs", doc_id, doc)
    refresh_kb_counts(pid, doc["kbId"])
    return ok(doc_public(doc))


@router.delete("/knowledge/docs/{doc_id}")
def delete_kb_doc(doc_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    doc = must_doc("kbDocs", doc_id, pid)
    delete_chunks(store, pid, doc_id)
    store.delete("kbDocs", doc_id)
    refresh_kb_counts(pid, doc["kbId"])
    return ok(None)


@router.get("/knowledge/docs/{doc_id}/chunks")
def kb_doc_chunks(doc_id: str, pid: str = Depends(project_scope)) -> dict[str, Any]:
    doc = must_doc("kbDocs", doc_id, pid)
    chunks = sorted(
        [item for item in store.all("kbChunks", pid) if item.get("docId") == doc["id"]],
        key=lambda item: item.get("index", 0),
    )
    return ok([{"index": item.get("index", 0), "content": item.get("content", "")} for item in chunks])


@router.post("/knowledge/recall")
def recall(body: RecallRequest, pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(search(pid, body.query, body.topK, getattr(body, "kbId", None)))


# ---------------- chat ----------------
@router.get("/ai/conversations")
def list_conversations(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("conversations", pid))


@router.post("/ai/conversations")
def create_conversation(body: ConversationCreate, pid: str = Depends(project_scope)) -> dict[str, Any]:
    conversation = {
        "id": uid("CV"), "projectId": pid, "title": body.title, "updatedAt": now_label(), "messages": [],
    }
    store.put("conversations", conversation["id"], conversation)
    return ok(conversation)


@router.patch("/ai/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: str, body: RenameRequest, pid: str = Depends(project_scope)
) -> dict[str, Any]:
    conversation = must_doc("conversations", conversation_id, pid)
    conversation["title"] = body.title
    store.put("conversations", conversation_id, conversation)
    return ok(store.all("conversations", pid))


@router.delete("/ai/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, pid: str = Depends(project_scope)) -> dict[str, Any]:
    must_doc("conversations", conversation_id, pid)
    store.delete("conversations", conversation_id)
    return ok(store.all("conversations", pid))


@router.get("/ai/config")
def get_chat_config(_: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.single("chatConfig", {}))


@router.put("/ai/config")
def save_chat_config(body: ChatConfigModel, _: str = Depends(project_scope)) -> dict[str, Any]:
    store.set_single("chatConfig", body.model_dump())
    return ok(body.model_dump())


@router.post("/ai/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: str, body: ChatSend, pid: str = Depends(project_scope)
) -> dict[str, Any]:
    conversation = store.get("conversations", conversation_id, pid)
    if not conversation:
        conversation = {
            "id": uid("CV"), "projectId": pid, "title": body.text[:16], "updatedAt": now_label(), "messages": [],
        }
    user_message = {"id": uid("M"), "role": "user", "content": body.text}
    config = store.single("chatConfig", {}) or {}
    kb_ids = config.get("kbIds") or []
    if kb_ids:
        merged = []
        for kb_id in kb_ids:
            merged.extend(search(pid, body.text, 5, kb_id))
        hits = []
        seen = set()
        for hit in sorted(merged, key=lambda item: item["score"], reverse=True):
            key = (hit["doc"], hit["chunkIndex"])
            if key not in seen:
                seen.add(key)
                hits.append(hit)
        hits = hits[:5]
    else:
        hits = search(pid, body.text, 5)
    context = "\n\n".join(f"[{hit['doc']} · 段落 {hit['chunkIndex']}]\n{hit['content']}" for hit in hits) or "（知识库没有检索到相关内容）"
    system_prompt = config.get("systemPrompt") or "你是物业与测试领域的资深助手。"
    system = (
        f"{system_prompt}\n\n"
        "回答时优先使用下方知识库片段；如果片段不足以回答，明确说明缺少什么，不要编造。"
        f"\n\n知识库片段：\n{context}"
    )
    try:
        content, usage = chat_text(system, body.text, config.get("model"))
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc
    assistant_message = {
        "id": uid("M"),
        "role": "assistant",
        "content": content,
        "citations": [
            {"doc": hit["doc"], "chunk": f"段落 {hit['chunkIndex']}", "score": hit["score"]}
            for hit in hits
        ],
        "toolCalls": [{"name": "knowledge.search", "args": f'{{"query":"{body.text[:80]}","top_k":5}}', "result": f"{len(hits)} chunks"}],
        "usage": usage,
    }
    conversation.setdefault("messages", []).extend([user_message, assistant_message])
    conversation["updatedAt"] = now_label()
    if conversation["title"] == "新会话":
        conversation["title"] = body.text[:16]
    store.put("conversations", conversation["id"], conversation)
    return ok({"conversationId": conversation["id"], "userMessage": user_message, "message": assistant_message})


# ---------------- workflow ----------------
@router.get("/workflows")
def list_workflows(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("workflows", pid))


@router.post("/workflows")
def save_workflow(body: WorkflowSave, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    existing = next((item for item in store.all("workflows", pid) if item.get("name") == body.name), None)
    workflow = {
        "id": existing["id"] if existing else uid("WF"),
        "projectId": pid,
        "name": body.name,
        "description": body.description or (existing or {}).get("description", ""),
        "nodes": body.nodes,
        "updatedAt": now_label(),
    }
    store.put("workflows", workflow["id"], workflow)
    return ok(workflow)


@router.post("/workflows/run")
def run_workflow(body: WorkflowRunRequest, _: str = Depends(project_editor_scope)) -> dict[str, Any]:
    if not body.nodes:
        raise HTTPException(400, "工作流没有节点")
    return ok(workflow_run(body.name, body.nodes))
