"""Agent adapters: HTTP, CLI and deterministic mock."""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx

from ..config import settings


def _mock_base_time() -> datetime:
    return datetime.now(UTC) - timedelta(milliseconds=100)
SUCCESS_ANSWER = "推荐牧高笛双层帐篷，价格 399 元，防风防雨，适合露营。"
HALLUCINATION_ANSWER = SUCCESS_ANSWER + "该帐篷支持永久免费退换，并提供十年质保。"


class AdapterError(RuntimeError):
    """Raised when a target cannot produce a usable trace."""


@dataclass
class AdapterResult:
    trace: dict[str, Any]
    latency_ms: int = 0
    conversation: list[dict[str, Any]] | None = None

    @property
    def final_output(self) -> dict[str, Any]:
        trace = self.trace
        output = {
            "answer": trace.get("answer") or "",
            "status": trace.get("status") or "ok",
            "intent": trace.get("intent"),
            "agent": trace.get("agent"),
            "tools": [item.get("name") for item in trace.get("tool_calls") or [] if isinstance(item, dict)],
        }
        if self.conversation is not None:
            last = self.conversation[-1] if self.conversation else {}
            output.update({
                "answer": last.get("answer") or trace.get("answer") or "",
                "cards": last.get("cards") or [],
                "sources": last.get("sources") or [],
                "tokens": last.get("tokens") or {},
                "degraded": bool(last.get("degraded")),
                "runId": last.get("runId"),
                "agent": last.get("agent"),
                "intent": last.get("intent"),
                "tools": last.get("tools") or [],
                "cartState": trace.get("cartState") or trace.get("cart_state") or {},
            })
        return output


def run_target(
    adapter_type: str,
    config: dict[str, Any],
    command: str,
    payload: dict[str, Any] | None = None,
    turns: list[str] | None = None,
    run_id: str = "",
) -> AdapterResult:
    """Execute a target synchronously and return the raw trace."""
    started = time.perf_counter()
    adapter = (adapter_type or "http").lower()
    conversation: list[dict[str, Any]] | None = None
    if adapter == "http":
        trace = _http_run(config, command, payload or {})
    elif adapter == "cli":
        trace = _cli_run(config, command, payload or {})
    elif adapter == "mock":
        trace = _mock_run(config, command)
    elif adapter == "shangpin":
        from . import shangpin

        trace, conversation = shangpin.run(config, command, turns=turns, payload=payload or {},
                                           test_run_id=run_id)
    else:
        raise AdapterError(f"暂不支持的适配器类型：{adapter_type}")
    elapsed = int((time.perf_counter() - started) * 1000)
    trace_latency = int(trace.get("latency_ms") or 0)
    latency = max(elapsed, trace_latency) if adapter in {"mock", "shangpin"} else elapsed
    return AdapterResult(trace=trace, latency_ms=latency, conversation=conversation)


def _json_request(client: httpx.Client, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    try:
        response = client.request(method, url, **kwargs)
    except httpx.TimeoutException as exc:
        raise AdapterError("Agent 服务调用超时") from exc
    except httpx.HTTPError as exc:
        raise AdapterError(f"Agent 服务不可用：{type(exc).__name__}") from exc
    if response.status_code >= 400:
        raise AdapterError(f"Agent 服务返回 HTTP {response.status_code}: {response.text[:300]}")
    try:
        data = response.json()
    except ValueError as exc:
        raise AdapterError("Agent 服务返回了非 JSON 内容") from exc
    if not isinstance(data, dict):
        raise AdapterError("Agent 服务返回结构不正确")
    return data


def _http_run(config: dict[str, Any], command: str, payload: dict[str, Any]) -> dict[str, Any]:
    base_url = str(config.get("baseUrl") or config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise AdapterError("HTTP 适配器缺少 config.baseUrl")
    timeout = float(config.get("timeout") or settings.agent_service_timeout_seconds)
    headers = {"Content-Type": "application/json"}
    headers.update({str(key): str(value) for key, value in (config.get("headers") or {}).items()})
    body: dict[str, Any] = {"message": command, "payload": payload}
    if config.get("scenario"):
        body["scenario"] = config["scenario"]
    with httpx.Client(timeout=timeout) as client:
        chat = _json_request(client, "POST", f"{base_url}/agent/chat", json=body, headers=headers)
        run_id = chat.get("run_id") or chat.get("runId")
        if run_id:
            trace = _json_request(
                client,
                "GET",
                f"{base_url}/agent/runs/{quote(str(run_id))}",
                headers=headers,
            )
        elif isinstance(chat.get("trace"), dict):
            trace = chat["trace"]
        else:
            trace = chat
    return trace


def _parse_json_output(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    candidates = [text]
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        candidates.append(match.group(0))
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise AdapterError("CLI 输出不是合法 JSON")


def _cli_run(config: dict[str, Any], command: str, payload: dict[str, Any]) -> dict[str, Any]:
    raw_command = config.get("command")
    if not raw_command:
        raise AdapterError("CLI 适配器缺少 config.command")
    timeout = float(config.get("timeout") or settings.agent_service_timeout_seconds)
    env = os.environ.copy()
    env.update({str(key): str(value) for key, value in (config.get("env") or {}).items()})
    stdin_text = json.dumps({"message": command, "payload": payload}, ensure_ascii=False)
    try:
        process = subprocess.run(
            raw_command,
            shell=isinstance(raw_command, str),
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=config.get("cwd") or None,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AdapterError("CLI 执行超时") from exc
    except OSError as exc:
        raise AdapterError(f"CLI 启动失败：{exc}") from exc
    if process.returncode != 0:
        raise AdapterError(f"CLI 执行失败（exit {process.returncode}）：{(process.stderr or '')[:300]}")
    data = _parse_json_output(process.stdout or "")
    if isinstance(data.get("trace"), dict):
        return data["trace"]
    if data.get("run_id") and not data.get("tool_calls"):
        raise AdapterError("CLI 只返回了 run_id，未返回 trace")
    return data


def _mock_run(config: dict[str, Any], command: str) -> dict[str, Any]:
    scenario = str(config.get("scenario") or "success")
    if scenario == "malformed":
        raise AdapterError("mock 返回了非 JSON 内容")
    if scenario == "timeout":
        raise AdapterError("mock Agent 调用超时")
    return build_mock_trace(scenario, command, headers=config.get("headers") or {})


def _llm_calls(answer: str, base: datetime) -> list[dict[str, Any]]:
    return [
        {
            "node": "planner",
            "model": "mock-llm",
            "prompt": "分析用户意图并选择 Agent",
            "response": "product_search -> ShoppingGuideAgent",
            "latency_ms": 18,
            "at": (base + timedelta(milliseconds=10)).isoformat(),
            "usage": {"prompt_tokens": 36, "completion_tokens": 12},
        },
        {
            "node": "answer",
            "model": "mock-llm",
            "prompt": "基于工具与检索结果生成回答",
            "response": answer,
            "latency_ms": 24,
            "at": (base + timedelta(milliseconds=60)).isoformat(),
            "usage": {"prompt_tokens": 64, "completion_tokens": 28},
        },
    ]


def _tool_call(name: str, args: dict[str, Any], result: dict[str, Any], base: datetime) -> dict[str, Any]:
    return {
        "name": name,
        "args": args,
        "result": result,
        "status": "ok",
        "latency_ms": 12,
        "at": (base + timedelta(milliseconds=30)).isoformat(),
    }


def _retrieval(query: str, hits: list[dict[str, Any]], base: datetime) -> dict[str, Any]:
    return {
        "query": query,
        "backend": "pgvector",
        "hits": hits,
        "fallback": False,
        "error": None,
        "latency_ms": 9,
        "at": (base + timedelta(milliseconds=40)).isoformat(),
    }


def _standard_hits() -> list[dict[str, Any]]:
    return [
        {
            "title": "露营装备采购指南",
            "source": "kb://outdoor",
            "score": 0.92,
            "content": "牧高笛双层帐篷 399 元，防风防雨，适合露营。",
        }
    ]


def build_mock_trace(
    scenario: str = "success",
    message: str = "",
    run_id: str | None = None,
    headers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Deterministic trace generator shared by the mock adapter and mock service."""
    scenario = scenario or "success"
    base = _mock_base_time()
    trace: dict[str, Any] = {
        "run_id": run_id or f"run-mock-{scenario}",
        "trace_id": f"trace-mock-{scenario}",
        "message": message,
        "intent": "product_search",
        "agent": "ShoppingGuideAgent",
        "status": "ok",
        "answer": SUCCESS_ANSWER,
        "headers": headers or {},
        "llm_calls": _llm_calls(SUCCESS_ANSWER, base),
        "tool_calls": [
            _tool_call(
                "searchProducts",
                {"keyword": "帐篷"},
                {
                    "items": [
                        {"title": "牧高笛双层帐篷", "price": 399, "features": ["防风", "防雨"]}
                    ],
                    "total": 1,
                },
                base,
            )
        ],
        "retrievals": [_retrieval("露营帐篷", _standard_hits(), base)],
        "steps": [
            {"name": "route", "status": "ok", "at": (base + timedelta(milliseconds=5)).isoformat(), "detail": {"intent": "product_search"}},
            {"name": "answer", "status": "ok", "at": (base + timedelta(milliseconds=70)).isoformat(), "detail": {}},
        ],
        "latency_ms": 120,
    }
    if scenario == "wrong_intent":
        trace.update({
            "intent": "order_query",
            "agent": "OrderAgent",
            "answer": "请提供订单号，我来帮您查询订单状态。",
            "llm_calls": _llm_calls("请提供订单号，我来帮您查询订单状态。", base),
            "tool_calls": [
                _tool_call("queryOrder", {"orderId": ""}, {"error": "缺少订单号"}, base)
            ],
            "retrievals": [],
        })
    elif scenario == "missing_tool":
        trace["tool_calls"] = []
    elif scenario == "empty_retrieval":
        trace["retrievals"] = [_retrieval("露营帐篷", [], base)]
    elif scenario == "hallucination":
        trace["answer"] = HALLUCINATION_ANSWER
        trace["llm_calls"] = _llm_calls(HALLUCINATION_ANSWER, base)
    elif scenario == "need_auth":
        trace.update({
            "intent": "order_query",
            "agent": "OrderAgent",
            "status": "need_auth",
            "answer": "请先登录后查看订单。",
            "llm_calls": _llm_calls("请先登录后查看订单。", base),
            "tool_calls": [],
            "retrievals": [],
        })
    elif scenario == "timeout":
        trace.update({"status": "timeout", "answer": "", "tool_calls": [], "retrievals": []})
    return trace
