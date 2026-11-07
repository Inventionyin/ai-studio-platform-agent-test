from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..auth import ROLE_ADMIN, require_roles
from ..config import settings
from ..crypto import decrypt_json
from ..models import User
from ..response import ok
from ..store import store

router = APIRouter(dependencies=[Depends(require_roles(ROLE_ADMIN))])


def error_text(exc: BaseException) -> str:
    if isinstance(exc, BaseExceptionGroup):
        return "; ".join(error_text(item) for item in exc.exceptions)
    return str(exc)


@router.post("/mcp/servers/{server_id}/test")
async def test_server(server_id: str) -> dict[str, Any]:
    server = store.get("mcpServers", server_id)
    if not server:
        raise HTTPException(404, "MCP 服务不存在")

    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    env = {**os.environ, **decrypt_json(server.get("envEncrypted"))}
    params = StdioServerParameters(command=server["command"], args=server.get("args", []), env=env)

    async def connect() -> list[dict[str, Any]]:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                return [
                    {
                        "name": tool.name,
                        "description": tool.description or "",
                        "inputSchema": getattr(tool, "inputSchema", {}),
                    }
                    for tool in result.tools
                ]

    try:
        tools = await asyncio.wait_for(connect(), timeout=settings.mcp_timeout_seconds)
        server["status"] = "正常"
        server["tools"] = tools
        server.pop("lastError", None)
    except Exception as exc:  # noqa: BLE001 - surfaced as connection result
        server["status"] = "异常"
        server["tools"] = []
        server["lastError"] = error_text(exc)
    server["lastTestedAt"] = datetime.now(UTC).isoformat()
    store.put("mcpServers", server_id, server)
    return ok({key: value for key, value in server.items() if key != "envEncrypted"})
