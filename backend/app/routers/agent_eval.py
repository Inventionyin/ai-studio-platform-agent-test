"""Agent 评测与真实链路代理：报告、运行记录、真实调用、自动验证。"""
from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..auth import ROLE_ADMIN, ROLE_DEVELOPER, get_current_user, require_roles
from ..config import settings
from ..models import User
from ..response import ok
from ..schemas import AgentChatRequest

router = APIRouter(prefix="/agent-eval", tags=["agent-eval"])

REPORT_NAMES = {"rule", "real"}

PROBES: list[dict[str, Any]] = [
    {
        "key": "shopping",
        "label": "商品搜索链路",
        "message": "帮我找一顶露营帐篷",
        "expectAgent": "ShoppingGuideAgent",
        "expectStatus": "ok",
        "expectTool": "searchProducts",
        "expectRetrieval": False,
    },
    {
        "key": "knowledge",
        "label": "知识库 RAG 链路",
        "message": "退款一般多久到账？",
        "expectAgent": "KnowledgeAgent",
        "expectStatus": "ok",
        "expectTool": "searchFaq",
        "expectRetrieval": True,
    },
    {
        "key": "order_guard",
        "label": "订单鉴权边界",
        "message": "我的订单到哪了？",
        "expectAgent": "OrderAgent",
        "expectStatus": "need_auth",
        "expectTool": None,
        "expectRetrieval": False,
    },
]


async def _agent_request(method: str, path: str, **kwargs: Any) -> Any:
    base_url = settings.agent_service_url.rstrip("/")
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=settings.agent_service_timeout_seconds) as client:
            response = await client.request(method, path, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Agent 服务不可用：{type(exc).__name__}") from exc
    if response.status_code >= 400:
        raise HTTPException(502, f"Agent 服务返回 HTTP {response.status_code}: {response.text[:300]}")
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "Agent 服务返回了非 JSON 内容") from exc


async def _chat_and_trace(payload: dict[str, Any], authorization: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    headers = {"Authorization": authorization} if authorization else {}
    response = await _agent_request("POST", "/agent/chat", json=payload, headers=headers)
    run_id = response.get("run_id")
    if not run_id:
        raise HTTPException(502, "Agent 服务未返回 run_id")
    trace = await _agent_request("GET", f"/agent/runs/{quote(str(run_id))}")
    return response, trace


@router.get("/health")
async def agent_health(_: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok(await _agent_request("GET", "/health"))


@router.get("/reports")
async def list_reports(_: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok(await _agent_request("GET", "/eval/reports"))


@router.get("/reports/{name}")
async def get_report(name: str, _: User = Depends(get_current_user)) -> dict[str, Any]:
    if name not in REPORT_NAMES:
        raise HTTPException(404, "评测报告不存在")
    return ok(await _agent_request("GET", f"/eval/reports/{name}"))


@router.get("/runs")
async def list_runs(_: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok(await _agent_request("GET", "/agent/runs"))


@router.get("/runs/{run_id}")
async def get_run(run_id: str, _: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok(await _agent_request("GET", f"/agent/runs/{quote(run_id)}"))


@router.post("/chat")
async def real_chat(
    body: AgentChatRequest,
    _: User = Depends(require_roles(ROLE_ADMIN, ROLE_DEVELOPER)),
) -> dict[str, Any]:
    payload: dict[str, Any] = {"message": body.message}
    if body.sessionId:
        payload["session_id"] = body.sessionId
    response, trace = await _chat_and_trace(payload, body.authorization)
    return ok({"response": response, "trace": trace})


@router.post("/verify")
async def verify_agent(
    _: User = Depends(require_roles(ROLE_ADMIN, ROLE_DEVELOPER)),
) -> dict[str, Any]:
    health = await _agent_request("GET", "/health")
    health_ok = health.get("status") == "UP"
    results = []
    for probe in PROBES:
        started = time.perf_counter()
        response, trace = await _chat_and_trace({"message": probe["message"]})
        tools = [item.get("name") for item in trace.get("tool_calls") or []]
        checks = [
            {
                "label": "Agent 路由",
                "passed": response.get("agent") == probe["expectAgent"],
                "detail": f"{response.get('agent')} / 期望 {probe['expectAgent']}",
            },
            {
                "label": "执行状态",
                "passed": response.get("status") == probe["expectStatus"],
                "detail": f"{response.get('status')} / 期望 {probe['expectStatus']}",
            },
            {
                "label": "LLM trace",
                "passed": len(trace.get("llm_calls") or []) > 0,
                "detail": f"{len(trace.get('llm_calls') or [])} 次 LLM 调用",
            },
        ]
        if probe["expectTool"]:
            checks.append({
                "label": "工具调用",
                "passed": probe["expectTool"] in tools,
                "detail": f"{', '.join(tools) or '无'} / 期望 {probe['expectTool']}",
            })
        if probe["expectRetrieval"]:
            retrievals = trace.get("retrievals") or []
            checks.append({
                "label": "知识检索",
                "passed": len(retrievals) > 0 and bool(retrievals[0].get("hits")),
                "detail": f"{len(retrievals)} 次检索 / backend={retrievals[0].get('backend') if retrievals else '无'}",
            })
        passed = all(item["passed"] for item in checks)
        results.append({
            "key": probe["key"],
            "label": probe["label"],
            "message": probe["message"],
            "passed": passed,
            "checks": checks,
            "runId": response.get("run_id"),
            "agent": response.get("agent"),
            "intent": response.get("intent"),
            "status": response.get("status"),
            "answer": response.get("answer"),
            "latencyMs": round((time.perf_counter() - started) * 1000, 1),
            "traceSummary": {
                "llmCalls": len(trace.get("llm_calls") or []),
                "toolCalls": len(trace.get("tool_calls") or []),
                "retrievals": len(trace.get("retrievals") or []),
                "latencyMs": trace.get("latency_ms"),
            },
            "trace": trace,
        })
    return ok({
        "passed": health_ok and all(item["passed"] for item in results),
        "health": health,
        "probes": results,
    })
