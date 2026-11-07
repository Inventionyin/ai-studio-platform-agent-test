from __future__ import annotations

import ipaddress
import json
import secrets
import socket
import time
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user, project_editor_scope, project_reviewer_scope, project_scope
from ..config import settings
from ..db import get_db
from ..excel import export_testcases, import_testcases
from ..llm import LLMError, LLMUnavailable, extract_headings, generate_testcases, heading_alignment, local_split_requirements, relevance_coverage, split_requirements
from ..logic import generate_artifact, next_numeric_id, now_label, parse_openapi, uid
from ..models import Project, Requirement, RequirementFile, User
from ..parsing import SUPPORTED_EXTENSIONS, extract_text, safe_filename
from ..response import ok
from ..schemas import (
    ApiDefCreate, ApiSend, AppRunRequest, ElementCreate, FlowSave, GenerateCasesRequest, GenerateRequest,
    ImportYaml, RecorderStepIn, ReviewDecision, ReviewSubmit, RunRequest, ScriptCreate, ScriptUpdate, SplitConfirm,
    SuiteCreate, TestCaseCreate, TestCaseUpdate, ToolRun, YamlSave, RequirementCreate, RequirementUpdate,
)
from ..store import store

router = APIRouter()

UPLOAD_ROOT = Path(settings.upload_dir).resolve()


def project(db: Session, pid: str) -> Project:
    item = db.get(Project, pid)
    if not item:
        raise HTTPException(404, "项目不存在")
    return item


def must_doc(collection: str, doc_id: str, pid: str) -> dict[str, Any]:
    item = store.get(collection, doc_id, pid)
    if not item:
        raise HTTPException(404, f"{collection} 不存在: {doc_id}")
    return item


def iso(value: Any) -> str:
    return value.strftime("%Y-%m-%d %H:%M") if value else ""


def new_requirement_id(db: Session) -> str:
    items = db.scalars(select(Requirement.id)).all()
    return f"REQ-{next_numeric_id([{'id': item} for item in items], 'id', 'REQ'):03d}"


def requirement_public(requirement: Requirement, db: Session) -> dict[str, Any]:
    files = db.scalars(
        select(RequirementFile).where(RequirementFile.requirement_id == requirement.id).order_by(RequirementFile.created_at)
    ).all()
    return {
        "id": requirement.id,
        "projectId": requirement.project_id,
        "parentId": requirement.parent_id,
        "kind": requirement.kind,
        "title": requirement.title,
        "priority": requirement.priority,
        "status": requirement.status,
        "owner": requirement.owner_name,
        "version": requirement.version,
        "description": requirement.description,
        "docName": requirement.doc_name,
        "points": requirement.points or [],
        "prototype": requirement.prototype,
        "apiYaml": requirement.api_yaml,
        "generations": requirement.generations or [],
        "splitStatus": requirement.split_status,
        "splitProposal": requirement.split_proposal,
        "createdAt": iso(requirement.created_at),
        "updatedAt": iso(requirement.updated_at),
        "files": [
            {
                "id": file.id,
                "filename": file.filename,
                "size": file.size,
                "parseStatus": file.parse_status,
                "createdAt": iso(file.created_at),
            }
            for file in files
        ],
    }


def requirement_text(requirement: Requirement, db: Session) -> str:
    files = db.scalars(
        select(RequirementFile).where(RequirementFile.requirement_id == requirement.id)
    ).all()
    parts = [requirement.title, requirement.description, *[file.parsed_text for file in files]]
    parts.extend(str(point) for point in (requirement.points or []))
    return "\n\n".join(part for part in parts if part).strip()


# ---------------- requirements ----------------
@router.get("/requirements")
def list_requirements(
    pid: str = Depends(project_scope), db: Session = Depends(get_db)
) -> dict[str, Any]:
    items = db.scalars(
        select(Requirement).where(Requirement.project_id == pid).order_by(Requirement.created_at)
    ).all()
    return ok([requirement_public(item, db) for item in items])


@router.get("/requirements/{requirement_id}")
def get_requirement(
    requirement_id: str, pid: str = Depends(project_scope), db: Session = Depends(get_db)
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    return ok(requirement_public(requirement, db))


@router.post("/requirements")
def create_requirement(
    body: RequirementCreate,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = Requirement(
        id=new_requirement_id(db),
        project_id=pid,
        kind="main",
        title=body.title,
        priority=body.priority,
        status="待解析",
        owner_name=body.owner or user.name,
        description=body.description,
        doc_name=body.docName,
        points=[],
        generations=[],
    )
    db.add(requirement)
    db.commit()
    return ok(requirement_public(requirement, db))


@router.put("/requirements/{requirement_id}")
def update_requirement(
    requirement_id: str,
    body: RequirementUpdate,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(400, "需求名称不能为空")
        requirement.title = body.title.strip()
    if body.priority is not None:
        requirement.priority = body.priority
    if body.status is not None:
        requirement.status = body.status
    if body.owner is not None:
        requirement.owner_name = body.owner
    if body.description is not None:
        requirement.description = body.description
    db.commit()
    return ok(requirement_public(requirement, db))


@router.post("/requirements/upload")
def upload_requirements(
    files: list[UploadFile] = File(...),
    title: str = Form(""),
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not files:
        raise HTTPException(400, "请选择至少一个文件")
    requirement = Requirement(
        id=new_requirement_id(db),
        project_id=pid,
        kind="main",
        title=title.strip() or Path(files[0].filename or "需求").stem,
        priority="P1",
        status="解析中",
        owner_name=user.name,
        description="",
        points=[],
        generations=[],
        split_status="待拆分",
    )
    db.add(requirement)
    db.flush()
    folder = UPLOAD_ROOT / pid / requirement.id
    folder.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    parsed_parts = []
    for upload in files:
        filename = safe_filename(upload.filename or "document")
        suffix = Path(filename).suffix.lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            raise HTTPException(400, f"不支持的文件类型：{filename}")
        content = upload.file.read()
        total_bytes += len(content)
        if total_bytes > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"文件总大小超过 {settings.max_upload_mb}MB")
        stored = folder / f"{secrets.token_hex(8)}{suffix}"
        stored.write_bytes(content)
        try:
            parsed = extract_text(stored, filename)
            status = "已解析"
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:  # noqa: BLE001 - parser failures must be visible
            parsed = ""
            status = "解析失败"
            print(f"[parse] {filename}: {exc}")
        parsed_parts.append(parsed)
        db.add(RequirementFile(
            id=f"RF-{secrets.token_hex(6)}",
            requirement_id=requirement.id,
            filename=filename,
            stored_path=str(stored.relative_to(UPLOAD_ROOT)),
            mime=upload.content_type or "",
            size=len(content),
            parsed_text=parsed,
            parse_status=status,
        ))
    requirement.doc_name = files[0].filename
    requirement.description = "\n\n".join(part for part in parsed_parts if part)[:20000]
    requirement.status = "已解析"
    db.commit()
    return ok(requirement_public(requirement, db))


@router.get("/requirements/{requirement_id}/files/{file_id}")
def download_requirement_file(
    requirement_id: str,
    file_id: str,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    file = db.scalar(select(RequirementFile).where(
        RequirementFile.id == file_id, RequirementFile.requirement_id == requirement_id
    ))
    if not file:
        raise HTTPException(404, "文件不存在")
    requirement = db.get(Requirement, requirement_id)
    if not requirement or requirement.project_id != pid:
        raise HTTPException(404, "文件不存在")
    path = (UPLOAD_ROOT / file.stored_path).resolve()
    if UPLOAD_ROOT not in path.parents or not path.exists():
        raise HTTPException(404, "文件已丢失")
    return StreamingResponse(
        BytesIO(path.read_bytes()),
        media_type=file.mime or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file.filename}"'},
    )


@router.get("/requirements/{requirement_id}/files/{file_id}/text")
def requirement_file_text(
    requirement_id: str,
    file_id: str,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    file = db.scalar(
        select(RequirementFile).where(RequirementFile.id == file_id, RequirementFile.requirement_id == requirement_id)
    )
    if not requirement or not file:
        raise HTTPException(404, "文件不存在")
    return ok({"filename": file.filename, "text": file.parsed_text[:50000], "parseStatus": file.parse_status})


@router.delete("/requirements/{requirement_id}")
def delete_requirement(
    requirement_id: str,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    db.delete(requirement)
    db.commit()
    return ok(None)


@router.post("/requirements/{requirement_id}/generate")
def generate_requirement(
    requirement_id: str,
    body: GenerateRequest,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    current = {
        "id": requirement.id,
        "version": requirement.version,
        "title": requirement.title,
        "prototype": requirement.prototype,
        "apiYaml": requirement.api_yaml,
        "generations": requirement.generations or [],
    }
    result = generate_artifact(current, body.kind)
    requirement.version = current["version"]
    requirement.prototype = current["prototype"]
    requirement.api_yaml = current["apiYaml"]
    requirement.generations = current["generations"]
    db.commit()
    return ok(result)


@router.put("/requirements/{requirement_id}/prototype")
def save_prototype(
    requirement_id: str,
    prototype: dict[str, Any],
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    requirement.prototype = prototype
    db.commit()
    return ok(requirement_public(requirement, db))


@router.put("/requirements/{requirement_id}/yaml")
def save_yaml(
    requirement_id: str,
    body: YamlSave,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    requirement.api_yaml = body.yaml
    db.commit()
    return ok(requirement_public(requirement, db))


@router.post("/requirements/{requirement_id}/split")
def split_requirement(
    requirement_id: str,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    requirement = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not requirement:
        raise HTTPException(404, "需求不存在")
    text = requirement_text(requirement, db)
    if len(text) < 40:
        raise HTTPException(400, "需求内容太少，无法拆分")
    local_children = local_split_requirements(requirement.title, text)
    headings = extract_headings(text, requirement.title)
    mode = "local"
    try:
        children = split_requirements(requirement.title, text)
        mode = "ai"
        if local_children and relevance_coverage(children, text) < 0.45:
            children = local_children
            mode = "local"
        elif headings and heading_alignment(children, headings) < max(1, len(children) // 2):
            children = local_children
            mode = "local"
    except (LLMUnavailable, LLMError):
        if not local_children:
            requirement.split_status = "拆分失败"
            db.commit()
            raise HTTPException(502, "模型不可用，且文档没有可提取的章节")
        children = local_children
        mode = "local"
    requirement.split_status = "待确认"
    requirement.split_proposal = {"children": children, "mode": mode}
    db.commit()
    return ok(requirement_public(requirement, db))


@router.post("/requirements/{requirement_id}/split/confirm")
def confirm_split(
    requirement_id: str,
    body: SplitConfirm,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    parent = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not parent:
        raise HTTPException(404, "需求不存在")
    if not body.children:
        raise HTTPException(400, "没有可创建的子需求")
    existing = db.scalars(
        select(Requirement).where(Requirement.parent_id == requirement_id)
    ).all()
    for item in existing:
        db.delete(item)
    db.flush()
    created = []
    for child in body.children:
        requirement = Requirement(
            id=new_requirement_id(db),
            project_id=pid,
            parent_id=parent.id,
            kind="sub",
            title=child.title,
            priority=child.priority,
            status="待解析",
            owner_name=parent.owner_name,
            description=child.description,
            points=child.points,
            generations=[],
        )
        db.add(requirement)
        db.flush()
        created.append(requirement_public(requirement, db))
    parent.split_status = "已拆分"
    parent.split_proposal = {"children": [child.model_dump() for child in body.children]}
    db.commit()
    return ok(created)


@router.get("/requirements/{requirement_id}/children")
def list_children(
    requirement_id: str,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    parent = db.scalar(
        select(Requirement).where(Requirement.id == requirement_id, Requirement.project_id == pid)
    )
    if not parent:
        raise HTTPException(404, "需求不存在")
    children = db.scalars(select(Requirement).where(Requirement.parent_id == requirement_id)).all()
    return ok([requirement_public(item, db) for item in children])


# ---------------- testcases ----------------
@router.get("/testcases")
def list_testcases(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("testCases", pid))


@router.post("/testcases")
def create_testcase(
    body: TestCaseCreate,
    pid: str = Depends(project_editor_scope),
) -> dict[str, Any]:
    items = store.all("testCases", pid)
    case = {
        "id": f"TC-{next_numeric_id(items, 'id', 'TC')}",
        "projectId": pid,
        **body.model_dump(),
        "status": "草稿",
        "version": "v1",
        "updatedAt": now_label(),
    }
    store.put("testCases", case["id"], case)
    return ok(case)


@router.put("/testcases/{case_id}")
def update_testcase(
    case_id: str,
    body: TestCaseUpdate,
    pid: str = Depends(project_reviewer_scope),
) -> dict[str, Any]:
    case = must_doc("testCases", case_id, pid)
    case.update({key: value for key, value in body.model_dump().items() if value is not None})
    case["projectId"] = pid
    case["updatedAt"] = now_label()
    store.put("testCases", case_id, case)
    return ok(case)


@router.delete("/testcases/{case_id}")
def delete_testcase(case_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    must_doc("testCases", case_id, pid)
    store.delete("testCases", case_id)
    return ok(None)


@router.post("/testcases/generate")
def generate_cases(
    body: GenerateCasesRequest,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    context = body.source
    if body.requirementId:
        requirement = db.scalar(select(Requirement).where(
            Requirement.id == body.requirementId, Requirement.project_id == pid
        ))
        if not requirement:
            raise HTTPException(404, "需求不存在")
        context = requirement_text(requirement, db)
    try:
        drafts = generate_testcases(body.source, context)
    except LLMUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(502, str(exc)) from exc
    start = next_numeric_id(store.all("testCases", pid), "id", "TC")
    return ok([
        {
            "id": f"TC-{start + index}",
            "projectId": pid,
            **draft,
            "source": "AI",
            "owner": user.name,
            "status": "草稿",
            "version": "v1",
            "updatedAt": now_label(),
        }
        for index, draft in enumerate(drafts)
    ])


@router.post("/testcases/review")
def submit_review(
    body: ReviewSubmit,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    cases = store.all("testCases", pid)
    for draft in body.cases:
        existing = next(
            (case for case in cases if case.get("module") == draft.get("module") and case.get("title") == draft.get("title")),
            None,
        )
        if existing:
            case_id = existing["id"]
            existing.update({key: value for key, value in draft.items() if key != "id"})
            existing["status"] = "待评审"
            existing["projectId"] = pid
            existing["updatedAt"] = now_label()
            store.put("testCases", case_id, existing)
        else:
            case_id = str(draft.get("id") or uid("TC"))
            store.put("testCases", case_id, {
                **draft, "id": case_id, "projectId": pid, "status": "待评审", "updatedAt": now_label(),
            })
        if not store.get("reviews", case_id, pid):
            store.put("reviews", case_id, {
                "caseId": case_id,
                "projectId": pid,
                "title": draft.get("title", ""),
                "status": "待评审",
                "comments": [{
                    "id": uid("C"), "author": user.name, "content": "AI 生成草稿已提交评审",
                    "time": now_label(), "action": "提交评审",
                }],
            })
    return ok(len(body.cases))


@router.get("/testcases/reviews")
def review_queue(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("reviews", pid))


@router.post("/testcases/reviews/{case_id}")
def review_case(
    case_id: str,
    body: ReviewDecision,
    pid: str = Depends(project_reviewer_scope),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    review = must_doc("reviews", case_id, pid)
    review["status"] = body.action
    review.setdefault("comments", []).append({
        "id": uid("C"), "author": user.name, "content": body.comment or (
            "同意，覆盖完整" if body.action == "通过" else "请补充异常场景"
        ), "time": now_label(), "action": body.action,
    })
    store.put("reviews", case_id, review)
    case = store.get("testCases", case_id, pid)
    if case:
        case["status"] = body.action
        store.put("testCases", case_id, case)
    return ok(store.all("reviews", pid))


@router.get("/testcases/export.xlsx")
def export_cases(pid: str = Depends(project_scope)) -> StreamingResponse:
    buffer = export_testcases(store.all("testCases", pid))
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="testcases.xlsx"'},
    )


@router.post("/testcases/import.xlsx")
async def import_cases(
    file: UploadFile = File(...),
    pid: str = Depends(project_editor_scope),
) -> dict[str, Any]:
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"文件超过 {settings.max_upload_mb}MB")
    try:
        items, errors = import_testcases(content)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    existing = {case["id"]: case for case in store.all("testCases", pid)}
    created = updated = 0
    for item in items:
        case_id = item.get("id")
        if case_id and case_id in existing:
            existing[case_id].update({**item, "projectId": pid, "updatedAt": now_label()})
            existing[case_id]["id"] = case_id
            store.put("testCases", case_id, existing[case_id])
            updated += 1
        else:
            new_id = case_id if case_id and case_id not in existing else f"TC-{next_numeric_id(store.all('testCases', pid), 'id', 'TC')}"
            store.put("testCases", new_id, {
                **item, "id": new_id, "projectId": pid, "source": "Excel 导入",
                "owner": "", "status": item.get("status") or "待评审", "version": "v1",
                "updatedAt": now_label(),
            })
            created += 1
    return ok({"created": created, "updated": updated, "errors": errors})


# ---------------- api testing ----------------
@router.get("/api-defs")
def list_api_defs(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("apiDefs", pid))


@router.post("/api-defs")
def create_api_def(body: ApiDefCreate, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    item = {
        "id": uid("API"), "projectId": pid, "method": body.method, "path": body.path,
        "summary": body.name, "status": "启用", "source": "手工", "module": body.module, "creator": "",
    }
    store.put("apiDefs", item["id"], item)
    return ok(item)


@router.delete("/api-defs/{api_id}")
def delete_api_def(api_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    must_doc("apiDefs", api_id, pid)
    store.delete("apiDefs", api_id)
    return ok(None)


@router.post("/api-defs/import")
def import_api_defs(body: ImportYaml, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    parsed = parse_openapi(body.yaml)
    if not parsed:
        raise HTTPException(400, "未从 YAML 中解析到接口定义")
    existing = store.all("apiDefs", pid)
    added = []
    for item in parsed:
        if any(def_item.get("method") == item["method"] and def_item.get("path") == item["path"] for def_item in existing):
            continue
        record = {
            "id": uid("API"), "projectId": pid, "method": item["method"], "path": item["path"],
            "summary": item["summary"] or "导入接口", "status": "待调试",
            "source": "OpenAPI 导入", "module": body.module, "creator": "",
        }
        store.put("apiDefs", record["id"], record)
        added.append(record)
    return ok(added)


def json_value(body: str, path: str) -> Any:
    data = json.loads(body)
    current = data
    for part in path.removeprefix("$.").split("."):
        if not part:
            continue
        if isinstance(current, list):
            current = current[int(part)]
        else:
            current = current[part]
    return current


def evaluate_assertions(assertions: list[dict[str, Any]], status: int, body: str, elapsed_ms: int) -> tuple[int, int]:
    passed = 0
    for assertion in assertions:
        kind = str(assertion.get("type", ""))
        expected = str(assertion.get("expected", ""))
        try:
            if kind == "状态码":
                ok_value = str(status) == expected
            elif kind == "JSONPath":
                ok_value = str(json_value(body, str(assertion.get("expression", "")))) == expected
            elif kind == "响应时间":
                limit = int("".join(ch for ch in expected if ch.isdigit()) or "500")
                ok_value = elapsed_ms < limit
            elif kind == "响应体包含":
                ok_value = expected in body
            else:
                ok_value = False
        except Exception:
            ok_value = False
        passed += 1 if ok_value else 0
    return passed, len(assertions)


def validate_target(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(400, "URL 必须是以 http:// 或 https:// 开头的完整地址")
    if "{{" in url:
        raise HTTPException(400, "URL 仍包含 {{变量}}，请填写可访问的真实地址")
    if settings.allow_private_targets:
        return
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise HTTPException(400, "无法解析目标主机") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if address.is_private or address.is_loopback or address.is_link_local:
            raise HTTPException(400, "当前环境不允许访问内网地址")


@router.post("/api-defs/send")
def send_api_request(body: ApiSend, _: str = Depends(project_scope)) -> dict[str, Any]:
    validate_target(body.url)
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=settings.api_test_timeout_seconds, follow_redirects=True) as client:
            response = client.request(
                body.method.upper(),
                body.url,
                content=body.body.encode("utf-8") if body.body else None,
                headers={"Content-Type": "application/json"} if body.body else None,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"请求失败：{exc}") from exc
    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))
    text = response.text
    if isinstance(body.assertions, list) and body.assertions:
        passed, total = evaluate_assertions(body.assertions, response.status_code, text, elapsed_ms)
    else:
        default = [
            {"type": "状态码", "expression": "-", "expected": "200"},
            {"type": "JSONPath", "expression": "$.code", "expected": "0"},
            {"type": "响应时间", "expression": "-", "expected": "< 500ms"},
        ]
        passed, total = evaluate_assertions(default, response.status_code, text, elapsed_ms)
    return ok({
        "status": response.status_code,
        "statusText": response.reason_phrase or "",
        "timeMs": elapsed_ms,
        "sizeKb": round(len(response.content) / 1024, 2),
        "body": text,
        "assertionsPassed": passed,
        "assertionsTotal": total,
    })


@router.get("/api-suites")
def list_suites(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("suites", pid))


@router.post("/api-suites")
def create_suite(body: SuiteCreate, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    suite = {
        "id": uid("S"), "projectId": pid, "name": body.name, "count": body.count,
        "cron": body.cron, "lastResult": "-", "status": "启用",
    }
    store.put("suites", suite["id"], suite)
    return ok(suite)


@router.post("/api-suites/{suite_id}/run")
def run_suite(suite_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    suite = must_doc("suites", suite_id, pid)
    suite["lastResult"] = "成功"
    store.put("suites", suite_id, suite)
    return ok(suite)


@router.get("/api-reports")
def list_reports(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("reports", pid))


# ---------------- webui ----------------
@router.get("/ui/pages")
def list_ui_pages(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("uiPages", pid))


@router.get("/ui/elements")
def list_ui_elements(pageId: str | None = None, pid: str = Depends(project_scope)) -> dict[str, Any]:
    items = store.all("uiElements", pid)
    if pageId:
        items = [item for item in items if item.get("pageId") == pageId]
    return ok(items)


@router.post("/ui/elements")
def create_ui_element(body: ElementCreate, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    page = must_doc("uiPages", body.pageId, pid)
    element = {
        "id": uid("E"), "projectId": pid, "pageId": page["id"], "pageName": page["name"],
        "name": body.name, "selectorType": body.selectorType, "selectorValue": body.selectorValue,
    }
    store.put("uiElements", element["id"], element)
    return ok(element)


@router.delete("/ui/elements/{element_id}")
def delete_ui_element(element_id: str, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    must_doc("uiElements", element_id, pid)
    store.delete("uiElements", element_id)
    return ok(None)


@router.get("/ui/scripts")
def list_ui_scripts(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("uiScripts", pid))


@router.post("/ui/scripts")
def create_ui_script(body: ScriptCreate, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    script = {
        "id": uid("US"), "projectId": pid, "name": body.name, "framework": body.framework,
        "content": body.content, "updatedAt": now_label(), "status": "启用",
    }
    store.put("uiScripts", script["id"], script)
    return ok(script)


@router.put("/ui/scripts/{script_id}")
def save_ui_script(script_id: str, body: ScriptUpdate, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    script = must_doc("uiScripts", script_id, pid)
    script["content"] = body.content
    script["updatedAt"] = now_label()
    store.put("uiScripts", script_id, script)
    return ok(script)


@router.get("/ui/runs")
def list_ui_runs(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("uiRuns", pid))


@router.post("/ui/runs")
def run_ui_script(body: RunRequest, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    script = must_doc("uiScripts", body.scriptId, pid)
    run = {
        "id": uid("UR"), "projectId": pid, "script": script["name"], "browser": body.browser,
        "result": "成功", "shots": 3, "video": True, "time": now_label(), "duration": "36s",
    }
    store.put("uiRuns", run["id"], run)
    return ok(run)


@router.get("/ui/recorder")
def list_recorder_steps(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("recorderSteps", pid))


@router.post("/ui/recorder")
def add_recorder_step(body: RecorderStepIn, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    steps = store.all("recorderSteps", pid)
    step_id = max([int(step.get("id", 0)) for step in steps] + [0]) + 1
    store.put("recorderSteps", str(step_id), {"id": step_id, "projectId": pid, **body.model_dump()})
    return ok(store.all("recorderSteps", pid))


@router.delete("/ui/recorder")
def clear_recorder_steps(pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    store.replace("recorderSteps", [], project_id=pid)
    return ok([])


# ---------------- app automation ----------------
@router.get("/app/devices")
def list_devices(_: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("devices"))


@router.post("/app/devices/{device_id}/toggle")
def toggle_device(device_id: str, _: str = Depends(project_editor_scope)) -> dict[str, Any]:
    device = store.get("devices", device_id)
    if not device:
        raise HTTPException(404, "设备不存在")
    if device.get("status") == "在线":
        device["status"] = "离线"
        device["occupancy"] = "-"
    else:
        device["status"] = "在线"
        device["occupancy"] = "空闲"
    store.put("devices", device_id, device)
    return ok(store.all("devices"))


@router.post("/app/devices/{device_id}/release")
def release_device(device_id: str, _: str = Depends(project_editor_scope)) -> dict[str, Any]:
    device = store.get("devices", device_id)
    if not device:
        raise HTTPException(404, "设备不存在")
    device["occupancy"] = "空闲"
    store.put("devices", device_id, device)
    return ok(store.all("devices"))


@router.get("/app/flows")
def list_flows(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("flowNodes", pid))


@router.put("/app/flows")
def save_flows(body: FlowSave, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    store.replace("flowNodes", body.nodes, id_key="id", project_id=pid)
    return ok(store.all("flowNodes", pid))


@router.get("/app/runs")
def list_app_runs(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("appRuns", pid))


@router.post("/app/runs")
def run_app_flow(body: AppRunRequest, pid: str = Depends(project_editor_scope)) -> dict[str, Any]:
    run = {
        "id": uid("AR"), "projectId": pid, "flow": body.flow, "device": body.device,
        "result": "成功", "time": now_label(), "duration": "58s",
    }
    store.put("appRuns", run["id"], run)
    return ok(run)
