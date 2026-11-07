from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

from sqlalchemy import func, select

from .auth import hash_password
from .config import settings
from .kb import index_text
from .db import SessionLocal
from .models import Project, ProjectMember, Requirement, User
from .store import store

SEED_FILE = Path(__file__).parent / "seed.json"

PROJECT_SCOPED = {
    "testCases", "reviews", "apiDefs", "suites", "reports", "uiPages", "uiElements", "uiScripts",
    "uiRuns", "recorderSteps", "flowNodes", "appRuns", "kbs", "kbDocs", "conversations",
    "workflows", "taskHistory", "versions",
}
SKIP_COLLECTIONS = {
    "projects", "requirements", "members", "profile", "chatConfig", "dashboard",
    "dataTools", "dataHistory", "platformUsers",
}


def migrate_prototype(prototype: Any) -> Any:
    if not isinstance(prototype, dict) or "pages" in prototype:
        return prototype
    return {
        "flow": prototype.get("flow", ""),
        "pages": [{"name": prototype.get("page", "页面"), "sections": prototype.get("sections", [])}],
    }


def seed_all() -> None:
    payload = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    data = payload["db"]

    with SessionLocal() as db:
        if db.scalar(select(func.count(User.id))) == 0:
            password = settings.seed_admin_password
            if not password:
                if settings.app_env != "development":
                    raise RuntimeError("SEED_ADMIN_PASSWORD 未设置，生产环境拒绝启动")
                password = secrets.token_urlsafe(12)
                print(f"[seed] generated admin password: {password}")
            for member in data["members"]:
                is_admin = member["role"] == "管理员"
                profile = data.get("profile", {}) if is_admin else {}
                db.add(User(
                    id=member["id"],
                    email=member["email"],
                    name=member["name"],
                    password_hash=hash_password(password) if is_admin else None,
                    role=member["role"],
                    status=member["status"],
                    dept=member.get("dept", ""),
                    phone=profile.get("phone", ""),
                    title=profile.get("title", ""),
                    bio=profile.get("bio", ""),
                ))
            db.commit()

        if db.scalar(select(func.count(Project.id))) == 0:
            for item in data["projects"]:
                db.add(Project(
                    id=item["id"],
                    name=item["name"],
                    description=item.get("description", ""),
                    status=item.get("status", "正常"),
                    requirement_count=item.get("requirementCount", 0),
                    case_count=item.get("caseCount", 0),
                    api_count=item.get("apiCount", 0),
                    task_count=item.get("taskCount", 0),
                    pass_rate=item.get("passRate", 0),
                ))
                db.flush()
                for member in item.get("members", []):
                    db.add(ProjectMember(
                        id=f"PM-{item['id']}-{member['userId']}",
                        project_id=item["id"],
                        user_id=member["userId"],
                        role=member["role"],
                    ))
            db.commit()

        if db.scalar(select(func.count(Requirement.id))) == 0:
            owners = {user.name: user.id for user in db.scalars(select(User)).all()}
            for item in data["requirements"]:
                db.add(Requirement(
                    id=item["id"],
                    project_id="ecommerce",
                    kind="main",
                    title=item["title"],
                    priority=item.get("priority", "P1"),
                    status=item.get("status", "待解析"),
                    owner_id=owners.get(item.get("owner", "")),
                    owner_name=item.get("owner", ""),
                    version=item.get("version", "v1"),
                    description=item.get("description", ""),
                    doc_name=item.get("docName"),
                    points=item.get("points", []),
                    prototype=migrate_prototype(item.get("prototype")),
                    api_yaml=item.get("apiYaml"),
                    generations=item.get("generations", []),
                ))
            db.commit()

    if store.count("skills") > 0:
        return

    for collection, items in data.items():
        if collection in SKIP_COLLECTIONS or not isinstance(items, list):
            continue
        for index, item in enumerate(items, start=1):
            value = dict(item)
            key = value.get("id") or value.get("name") or value.get("caseId") or index
            if collection in PROJECT_SCOPED:
                value.setdefault("projectId", "ecommerce")
            if collection == "versions" and value.get("kind") == "原型结构":
                try:
                    value["content"] = json.dumps(
                        migrate_prototype(json.loads(value["content"])), ensure_ascii=False, indent=2
                    )
                except (json.JSONDecodeError, KeyError):
                    pass
            if collection in {"assets", "apiKeys"}:
                value.setdefault("userId", "U-001")
            store.put(collection, str(key), value)

    store.set_single("chatConfig", data["chatConfig"])
    store.set_single("dashboard", payload["dashboard"])

    if store.count("kbChunks", "ecommerce") == 0:
        seed_text = {
            "业务规则说明.md": "同一订单最多叠加 2 张优惠券，超出部分按优惠金额从高到低截断。满减券与折扣券不可同时使用；会员专享券可与平台券叠加，但最终优惠金额不得超过订单金额的 50%。退款时按各券分摊比例退回，已过期的券不返还。",
            "会员权益手册.pdf": "会员权益包括免运费、生日礼、专属客服和折扣券。黄金会员每季度可领取一次生日礼；重复领取需要提示已领取，权益数量不重复增加。",
            "优惠券叠加规则.docx": "平台券与店铺券可以叠加，同类券不可叠加。跨店铺下单时，店铺券仅作用于对应店铺商品金额。优惠券过期后不可使用，也不可补发。",
            "member-api.yaml": "GET /api/v1/member/profile 获取会员信息；GET /api/v1/member/points 查询积分明细；POST /api/v1/member/benefits/{id}/claim 领取权益，需要幂等校验。",
        }
        for doc in store.all("kbDocs", "ecommerce"):
            text = seed_text.get(doc.get("filename"))
            if not text:
                continue
            count = index_text(store, "ecommerce", doc["kbId"], doc["id"], text)
            doc["chunks"] = count
            store.put("kbDocs", doc["id"], doc)
