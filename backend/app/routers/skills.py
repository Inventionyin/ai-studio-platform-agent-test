from __future__ import annotations

import secrets
from typing import Any

import yaml
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import ROLE_ADMIN, ROLE_DEVELOPER, require_roles
from ..config import settings
from ..response import ok
from ..store import store

router = APIRouter()


def parse_skill_file(content: str, fallback_name: str) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    body = content
    if content.lstrip().startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                loaded = yaml.safe_load(parts[1])
                if isinstance(loaded, dict):
                    meta = loaded
            except yaml.YAMLError as exc:
                raise ValueError(f"SKILL.md frontmatter 解析失败：{exc}") from exc
            body = parts[2].strip()
    name = str(meta.get("name") or fallback_name).strip()
    description = str(meta.get("description") or "").strip()
    if not description:
        description = next((line.strip() for line in body.splitlines() if line.strip()), "")[:200]
    params = meta.get("params") or []
    if isinstance(params, dict):
        params = [{"name": key, "type": "string", "required": False, "desc": str(value)} for key, value in params.items()]
    if not isinstance(params, list):
        params = []
    return {
        "name": name,
        "description": description,
        "category": str(meta.get("category") or "导入"),
        "params": params,
        "prompt": body,
        "kind": "Skill",
        "calls": 0,
        "version": "v1.0",
        "source": "SKILL.md",
    }


@router.post("/skills/import")
async def import_skill(
    file: UploadFile = File(...),
    _=Depends(require_roles(ROLE_ADMIN, ROLE_DEVELOPER)),
) -> dict[str, Any]:
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"文件超过 {settings.max_upload_mb}MB")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "SKILL.md 必须是 UTF-8 文本") from exc
    try:
        skill = parse_skill_file(text, (file.filename or "skill").rsplit(".", 1)[0])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not skill["prompt"]:
        raise HTTPException(400, "SKILL.md 内容为空")
    skill["id"] = f"SK-{secrets.token_hex(5)}"
    store.put("skills", skill["id"], skill)
    return ok(skill)


@router.delete("/skills/{skill_id}")
def delete_skill(
    skill_id: str,
    _=Depends(require_roles(ROLE_ADMIN, ROLE_DEVELOPER)),
) -> dict[str, Any]:
    if not store.get("skills", skill_id):
        raise HTTPException(404, "技能不存在")
    store.delete("skills", skill_id)
    return ok(None)
