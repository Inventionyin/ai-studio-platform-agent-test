"""Fix-experience document and Agent test summary routes."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import project_scope
from ..db import get_db
from ..models import AgentRun, AgentTarget, AgentTestCase, FixRecord
from ..response import ok
from .deps import docs_dir

router = APIRouter()


@router.get("/docs")
def list_docs(_: str = Depends(project_scope)) -> dict[str, Any]:
    directory = docs_dir()
    if not directory.exists():
        return ok([])
    items = []
    for path in sorted(directory.glob("*.md")):
        if path.name.lower() == "readme.md" or path.name.startswith("_"):
            continue
        stat = path.stat()
        items.append({
            "name": path.name,
            "path": str(path),
            "size": stat.st_size,
            "updatedAt": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
        })
    return ok(items)


@router.get("/docs/{name}")
def get_doc(name: str, _: str = Depends(project_scope)) -> dict[str, Any]:
    path = docs_dir() / Path(name).name
    if path.name != name or path.suffix.lower() != ".md" or not path.exists():
        raise HTTPException(404, "文档不存在")
    return ok({"name": path.name, "content": path.read_text(encoding="utf-8")})


@router.get("/summary")
def summary(pid: str = Depends(project_scope), db: Session = Depends(get_db)) -> dict[str, Any]:
    targets = db.scalar(select(func.count(AgentTarget.id)).where(AgentTarget.project_id == pid)) or 0
    cases = db.scalar(select(func.count(AgentTestCase.id)).where(AgentTestCase.project_id == pid)) or 0
    runs = db.scalar(select(func.count(AgentRun.id)).where(
        AgentRun.project_id == pid, AgentRun.source_type == "ai_test"
    )) or 0
    passed = db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.project_id == pid, AgentRun.source_type == "ai_test", AgentRun.status == "pass"
        )
    ) or 0
    failed = db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.project_id == pid, AgentRun.source_type == "ai_test", AgentRun.status == "fail"
        )
    ) or 0
    needs_review = db.scalar(
        select(func.count(AgentRun.id)).where(
            AgentRun.project_id == pid, AgentRun.source_type == "ai_test", AgentRun.status == "needs_review"
        )
    ) or 0
    fixes = db.scalar(select(func.count(FixRecord.id)).where(FixRecord.project_id == pid)) or 0
    directory = docs_dir()
    docs = len([path for path in directory.glob("*.md") if path.name.lower() != "readme.md" and not path.name.startswith("_")]) if directory.exists() else 0
    return ok({
        "targets": targets, "cases": cases, "runs": runs,
        "passRate": round(passed / (passed + failed), 4) if passed + failed else 0.0,
        "failCount": failed, "needsReviewCount": needs_review, "fixes": fixes, "docs": docs,
    })
