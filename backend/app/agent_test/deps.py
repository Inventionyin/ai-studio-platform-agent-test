"""Shared lookups and path helpers for Agent test routes."""
from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AgentRun, AgentTarget, AgentTestCase, FixRecord, RunEvaluation


def get_target(db: Session, pid: str, target_id: str) -> AgentTarget:
    target = db.get(AgentTarget, target_id)
    if not target or target.project_id != pid:
        raise HTTPException(404, "目标不存在")
    return target


def get_case(db: Session, pid: str, case_id: str) -> AgentTestCase:
    case = db.get(AgentTestCase, case_id)
    if not case or case.project_id != pid:
        raise HTTPException(404, "用例不存在")
    return case


def get_run(db: Session, pid: str, run_id: str) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if not run or run.project_id != pid:
        raise HTTPException(404, "运行记录不存在")
    return run


def get_fix(db: Session, pid: str, fix_id: str) -> FixRecord:
    fix = db.get(FixRecord, fix_id)
    if not fix or fix.project_id != pid:
        raise HTTPException(404, "修复记录不存在")
    return fix


def evaluations_for(db: Session, run_id: str) -> list[RunEvaluation]:
    return db.scalars(
        select(RunEvaluation).where(RunEvaluation.run_id == run_id)
        .order_by(RunEvaluation.created_at, RunEvaluation.id)
    ).all()


def docs_dir() -> Path:
    return Path(settings.fix_doc_dir)
