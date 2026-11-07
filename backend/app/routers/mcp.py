from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..auth import ROLE_ADMIN, require_roles
from ..crypto import encrypt_json
from ..models import User
from ..response import ok
from ..schemas import McpServerCreate, McpServerUpdate
from ..store import store

router = APIRouter(dependencies=[Depends(require_roles(ROLE_ADMIN))])


@router.get("/mcp/servers")
def list_servers() -> dict[str, Any]:
    return ok([{key: value for key, value in item.items() if key != "envEncrypted"} for item in store.all("mcpServers")])


@router.post("/mcp/servers")
def create_server(body: McpServerCreate, user: User = Depends(require_roles(ROLE_ADMIN))) -> dict[str, Any]:
    server = {
        "id": f"MCP-{__import__('secrets').token_hex(5)}",
        "name": body.name,
        "command": body.command,
        "args": body.args,
        "description": body.description,
        "envKeys": sorted(body.env.keys()),
        "envEncrypted": encrypt_json(body.env),
        "status": "未检测",
        "tools": [],
        "lastTestedAt": None,
        "createdBy": user.id,
    }
    store.put("mcpServers", server["id"], server)
    return ok({key: value for key, value in server.items() if key != "envEncrypted"})


@router.put("/mcp/servers/{server_id}")
def update_server(server_id: str, body: McpServerUpdate) -> dict[str, Any]:
    server = store.get("mcpServers", server_id)
    if not server:
        raise HTTPException(404, "MCP 服务不存在")
    if body.name is not None:
        server["name"] = body.name
    if body.command is not None:
        server["command"] = body.command
    if body.args is not None:
        server["args"] = body.args
    if body.description is not None:
        server["description"] = body.description
    if body.env is not None:
        server["envKeys"] = sorted(body.env.keys())
        server["envEncrypted"] = encrypt_json(body.env)
    store.put("mcpServers", server_id, server)
    return ok({key: value for key, value in server.items() if key != "envEncrypted"})


@router.delete("/mcp/servers/{server_id}")
def delete_server(server_id: str) -> dict[str, Any]:
    if not store.get("mcpServers", server_id):
        raise HTTPException(404, "MCP 服务不存在")
    store.delete("mcpServers", server_id)
    return ok(None)
