from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import ROLE_ADMIN, get_current_user, project_role
from ..db import get_db
from ..models import Project, ProjectMember, Requirement, User
from ..response import ok
from ..schemas import ProjectCreate, ProjectMemberAssign, ProjectUpdate
from ..store import store

router = APIRouter()


def project_public(project: Project, db: Session) -> dict[str, Any]:
    members = db.scalars(select(ProjectMember).where(ProjectMember.project_id == project.id)).all()
    result = []
    for member in members:
        user = db.get(User, member.user_id)
        if user:
            result.append({"userId": user.id, "name": user.name, "role": member.role})
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "requirementCount": db.scalar(select(func.count(Requirement.id)).where(Requirement.project_id == project.id)) or 0,
        "caseCount": store.count("testCases", project.id),
        "apiCount": store.count("apiDefs", project.id),
        "taskCount": store.count("taskHistory", project.id),
        "passRate": project.pass_rate,
        "members": result,
    }


def accessible_project(db: Session, pid: str, user: User, admin_ok: bool = True) -> Project:
    project = db.get(Project, pid)
    if not project:
        raise HTTPException(404, "项目不存在")
    if user.role == ROLE_ADMIN and admin_ok:
        return project
    member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.user_id == user.id)
    )
    if not member:
        raise HTTPException(403, "不是该项目成员")
    return project


def require_project_admin(db: Session, pid: str, user: User) -> Project:
    project = db.get(Project, pid)
    if not project:
        raise HTTPException(404, "项目不存在")
    if user.role == ROLE_ADMIN:
        return project
    if project_role(pid, user, db) != ROLE_ADMIN:
        raise HTTPException(403, "需要项目管理员权限")
    return project


@router.get("/projects")
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if user.role == ROLE_ADMIN:
        projects = db.scalars(select(Project).where(Project.status != "已归档").order_by(Project.created_at)).all()
    else:
        projects = db.scalars(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user.id, Project.status != "已归档")
            .order_by(Project.created_at)
        ).all()
    return ok([project_public(project, db) for project in projects])


@router.post("/projects")
def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if user.role != ROLE_ADMIN:
        raise HTTPException(403, "只有平台管理员可以新建项目")
    project = Project(id=f"P-{secrets.token_hex(5)}", name=body.name, description=body.description, status="正常")
    db.add(project)
    db.flush()
    db.add(ProjectMember(id=f"PM-{project.id}-{user.id}", project_id=project.id, user_id=user.id, role=ROLE_ADMIN))
    db.commit()
    return ok(project_public(project, db))


@router.get("/projects/{pid}")
def get_project(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    project = accessible_project(db, pid, user)
    return ok(project_public(project, db))


@router.put("/projects/{pid}")
def update_project(
    pid: str,
    body: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = require_project_admin(db, pid, user)
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "项目名称不能为空")
        project.name = body.name.strip()
    if body.description is not None:
        project.description = body.description
    if body.status is not None:
        project.status = body.status
        project.archived_at = datetime.now(UTC) if body.status == "已归档" else None
    db.commit()
    return ok(project_public(project, db))


@router.delete("/projects/{pid}")
def archive_project(
    pid: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if user.role != ROLE_ADMIN:
        raise HTTPException(403, "只有平台管理员可以归档项目")
    project = db.get(Project, pid)
    if not project:
        raise HTTPException(404, "项目不存在")
    project.status = "已归档"
    project.archived_at = datetime.now(UTC)
    db.commit()
    return ok(None)


@router.get("/projects/{pid}/members")
def list_project_members(
    pid: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = accessible_project(db, pid, user)
    return ok(project_public(project, db)["members"])


@router.post("/projects/{pid}/members")
def assign_project_member(
    pid: str,
    body: ProjectMemberAssign,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = require_project_admin(db, pid, user)
    target = db.get(User, body.userId)
    if not target:
        raise HTTPException(404, "用户不存在")
    member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.user_id == body.userId)
    )
    if member:
        member.role = body.role
    else:
        db.add(ProjectMember(id=f"PM-{pid}-{body.userId}", project_id=pid, user_id=body.userId, role=body.role))
    db.commit()
    return ok(project_public(project, db))


@router.delete("/projects/{pid}/members/{user_id}")
def remove_project_member(
    pid: str,
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = require_project_admin(db, pid, user)
    member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.user_id == user_id)
    )
    if not member:
        raise HTTPException(404, "成员不存在")
    if user_id == user.id and user.role != ROLE_ADMIN:
        raise HTTPException(400, "不能移除自己")
    admins = db.scalars(
        select(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.role == ROLE_ADMIN)
    ).all()
    if member.role == ROLE_ADMIN and len(admins) <= 1:
        raise HTTPException(400, "项目至少保留一个管理员")
    db.delete(member)
    db.commit()
    return ok(project_public(project, db))
