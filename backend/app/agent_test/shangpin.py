"""Shang Pivot（尚品汇）AI 助手适配器（Phase 1）。

黑盒驱动 V3.0 legacy SSE 接口；当 ``engine=graph`` 时额外通过管理端
``/admin/customer-service/agent-runs/{runId}`` 拉取内部 trace 并归一化为 span。
所有网络/协议异常统一转换为 :class:`AdapterError`，不向 run 泄漏原始堆栈。
"""
from __future__ import annotations

import json
import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Any, Iterable

import httpx

from ..trace import new_id, parse_datetime
from .adapters import AdapterError

DEFAULT_PHONES = ["13900009999", "13900009998"]
DEFAULT_SMS_CODE = "123456"
DEFAULT_CLIENT_TYPE = "h5"
RATE_LIMIT_TEXT = "发送太频繁"

_phone_lock = threading.Lock()
_phone_cursor = 0


class _RateLimited(Exception):
    """Internal signal: HTTP 200 + JSON business response asks to retry."""


def _next_phone(config: dict[str, Any]) -> str:
    raw = config.get("customerPhones") or config.get("customer_phones") or DEFAULT_PHONES
    if isinstance(raw, str):
        phones = [item.strip() for item in raw.split(",") if item.strip()]
    else:
        phones = [str(item).strip() for item in raw if str(item).strip()]
    if not phones:
        phones = list(DEFAULT_PHONES)
    global _phone_cursor
    with _phone_lock:
        phone = phones[_phone_cursor % len(phones)]
        _phone_cursor += 1
    return phone


def _timeout(config: dict[str, Any]) -> float:
    return float(config.get("timeout") or 150)


def _base_url(config: dict[str, Any]) -> str:
    value = str(config.get("baseUrl") or config.get("base_url") or "").rstrip("/")
    if not value:
        raise AdapterError("尚品汇适配器缺少 config.baseUrl")
    return value


def _json_request(client: httpx.Client, method: str, url: str, **kwargs: Any) -> Any:
    """Perform a JSON request and unwrap the ``{code,msg,data}`` envelope."""
    try:
        response = client.request(method, url, **kwargs)
    except httpx.TimeoutException as exc:
        raise AdapterError("尚品汇服务调用超时") from exc
    except httpx.HTTPError as exc:
        raise AdapterError(f"尚品汇服务不可用：{type(exc).__name__}") from exc
    if response.status_code >= 400:
        raise AdapterError(f"尚品汇服务返回 HTTP {response.status_code}: {response.text[:300]}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise AdapterError("尚品汇服务返回了非 JSON 内容") from exc
    if not isinstance(payload, dict):
        raise AdapterError("尚品汇服务返回结构不正确")
    code = payload.get("code")
    if code not in (None, 0, "0"):
        message = payload.get("msg") or payload.get("message") or code
        raise AdapterError(f"尚品汇接口返回错误：{message}")
    data = payload.get("data", payload)
    return data if data is not None else {}


def login(client: httpx.Client, config: dict[str, Any]) -> tuple[str, str]:
    """Login as a customer and return ``(access_token, phone)``."""
    phone = _next_phone(config)
    body = {
        "phone": phone,
        "code": str(config.get("smsCode") or config.get("sms_code") or DEFAULT_SMS_CODE),
        "clientType": str(config.get("clientType") or config.get("client_type") or DEFAULT_CLIENT_TYPE),
    }
    data = _json_request(client, "POST", f"{_base_url(config)}/api/auth/login", json=body)
    token = data.get("accessToken") if isinstance(data, dict) else None
    if not token:
        raise AdapterError("尚品汇登录未返回 accessToken")
    return str(token), phone


def _test_headers(config: dict[str, Any], test_run_id: str = "") -> dict[str, str]:
    """标记测试流量，尚品汇据此把 session/run 记为 is_test，不污染真实指标。"""
    if config.get("testMode") is False or config.get("test_mode") is False:
        return {}
    source = str(config.get("testSource") or config.get("test_source") or "ai")
    headers = {"X-Agent-Test": source}
    if test_run_id:
        headers["X-Agent-Test-Run-Id"] = str(test_run_id)
    return headers


def create_session(client: httpx.Client, config: dict[str, Any], token: str,
                   test_run_id: str = "") -> str:
    data = _json_request(
        client,
        "POST",
        f"{_base_url(config)}/api/chat/sessions?fresh=true",
        json={},
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 # 每个平台 run 独立 client_key：即使同一测试手机并发，也不会互相结束会话。
                 "X-Chat-Client-Key": f"platform-{test_run_id or new_id()}",
                 **_test_headers(config, test_run_id)},
    )
    session_id = data.get("sessionId") if isinstance(data, dict) else None
    if session_id in (None, ""):
        raise AdapterError("尚品汇创建会话未返回 sessionId")
    return str(session_id)


def _items(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        value = data.get("items")
        return [item for item in value or [] if isinstance(item, dict)]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def clear_cart(client: httpx.Client, config: dict[str, Any], token: str) -> None:
    """Best-effort cart cleanup before a run."""
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(3):
        data = _json_request(client, "GET", f"{_base_url(config)}/api/cart", headers=headers)
        items = _items(data)
        if not items:
            return
        for item in items:
            item_id = item.get("cartItemId") or item.get("id")
            if item_id in (None, ""):
                continue
            _json_request(
                client,
                "DELETE",
                f"{_base_url(config)}/api/cart/items/{item_id}",
                headers=headers,
            )
        time.sleep(0.5)


def cart_state(client: httpx.Client, config: dict[str, Any], token: str) -> dict[str, int]:
    """Return the cart final state as ``{title: quantity}``."""
    data = _json_request(
        client,
        "GET",
        f"{_base_url(config)}/api/cart",
        headers={"Authorization": f"Bearer {token}"},
    )
    state: dict[str, int] = {}
    for item in _items(data):
        title = str(item.get("title") or item.get("name") or "")
        if not title:
            continue
        try:
            quantity = int(float(item.get("quantity") or 0))
        except (TypeError, ValueError):
            quantity = 0
        state[title] = state.get(title, 0) + quantity
    return state


def _string_list(value: Any, *keys: str) -> list[str]:
    result: list[str] = []
    for item in value or []:
        if isinstance(item, dict):
            text = next((item.get(key) for key in keys if item.get(key) not in (None, "")), None)
            if text is None:
                text = json.dumps(item, ensure_ascii=False)
            result.append(str(text))
        elif item not in (None, ""):
            result.append(str(item))
    return result


def _token_pair(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {"prompt": 0, "completion": 0}
    def number(key: str) -> int:
        try:
            return int(float(value.get(key) or 0))
        except (TypeError, ValueError):
            return 0
    return {"prompt": number("prompt"), "completion": number("completion")}


def parse_sse(chunks: str | bytes | Iterable[str | bytes]) -> dict[str, Any]:
    """Parse Shang Pivot SSE events into one normalized turn payload.

    Supported events: ``reasoning`` / ``delta`` / ``cards`` / ``action`` /
    ``done`` / ``error``. Unknown events are ignored.
    """
    if isinstance(chunks, (str, bytes)):
        lines: Iterable[str | bytes] = str(chunks, "utf-8").splitlines() if isinstance(chunks, bytes) else chunks.splitlines()
    else:
        lines = chunks

    result: dict[str, Any] = {
        "reasoning": "",
        "answer": "",
        "cards": [],
        "sources": [],
        "tokens": {"prompt": 0, "completion": 0},
        "degraded": False,
        "runId": None,
        "agent": None,
        "intent": None,
        "tools": [],
        "sessionStatus": None,
        "messageId": None,
        "actions": [],
        "error": None,
        "events": [],
    }
    event_name = ""
    for raw in lines:
        line = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        line = line.lstrip("\ufeff")
        if not line.strip() or line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line[6:].strip()
            continue
        if not line.startswith("data:"):
            continue
        data_text = line[5:].strip()
        if not data_text:
            continue
        try:
            data = json.loads(data_text)
        except json.JSONDecodeError as exc:
            raise AdapterError("尚品汇 SSE 数据不是合法 JSON") from exc
        if not isinstance(data, dict):
            continue
        if event_name:
            result["events"].append(event_name)
        if event_name == "reasoning":
            result["reasoning"] += str(data.get("delta") or "")
        elif event_name == "delta":
            result["answer"] += str(data.get("delta") or "")
        elif event_name == "cards":
            result["cards"].extend([item for item in data.get("items") or [] if isinstance(item, dict)])
        elif event_name == "action":
            result["actions"].append(data)
        elif event_name == "done":
            result["messageId"] = data.get("messageId")
            result["sessionStatus"] = data.get("sessionStatus")
            result["degraded"] = bool(data.get("degraded"))
            result["sources"] = _string_list(data.get("sources"), "source", "name", "id")
            result["tokens"] = _token_pair(data.get("tokens"))
            result["runId"] = data.get("runId")
            result["agent"] = data.get("agent")
            result["intent"] = data.get("intent")
            result["tools"] = _string_list(data.get("tools"), "name", "tool", "id")
        elif event_name == "error":
            result["error"] = data
        event_name = ""
    result["answer"] = result["answer"].strip()
    result["reasoning"] = result["reasoning"].strip()
    return result


def _send_once(
    client: httpx.Client,
    config: dict[str, Any],
    token: str,
    session_id: str,
    content: str,
    test_run_id: str = "",
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json",
               **_test_headers(config, test_run_id)}
    url = f"{_base_url(config)}/api/chat/sessions/{session_id}/messages"
    try:
        with client.stream("POST", url, json={"content": content}, headers=headers) as response:
            if response.status_code >= 400:
                response.read()
                raise AdapterError(f"尚品汇发送消息返回 HTTP {response.status_code}: {response.text[:300]}")
            content_type = response.headers.get("content-type", "").lower()
            if "text/event-stream" not in content_type:
                response.read()
                text = response.text
                try:
                    payload = json.loads(text)
                except json.JSONDecodeError as exc:
                    raise AdapterError("尚品汇发送消息返回了非 SSE 内容") from exc
                message = str((payload or {}).get("msg") or (payload or {}).get("message") or text)
                if RATE_LIMIT_TEXT in message:
                    raise _RateLimited(message)
                raise AdapterError(f"尚品汇发送消息失败：{message[:300]}")
            parsed = parse_sse(response.iter_lines())
    except _RateLimited:
        raise
    except AdapterError:
        raise
    except httpx.TimeoutException as exc:
        raise AdapterError("尚品汇发送消息超时") from exc
    except httpx.HTTPError as exc:
        raise AdapterError(f"尚品汇发送消息失败：{type(exc).__name__}") from exc
    if parsed.get("error"):
        error = parsed["error"] or {}
        raise AdapterError(f"尚品汇 SSE 错误：{error.get('code') or '-'} {error.get('msg') or ''}".strip())

    # 自动化测试默认替用户确认“加购”动作，继续验证购物车终态；
    # 人工体验/真实用户仍在页面上看到确认卡，不会自动执行。
    auto_confirm = config.get("autoConfirmActions", config.get("auto_confirm_actions", True))
    if auto_confirm and parsed.get("actions"):
        for action in list(parsed["actions"]):
            if not isinstance(action, dict) or action.get("tool") != "addToCart":
                continue
            action_id = action.get("actionId")
            if action_id in (None, ""):
                continue
            try:
                confirmed = _json_request(
                    client,
                    "POST",
                    f"{_base_url(config)}/api/chat/sessions/{session_id}/actions/{action_id}/confirm",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                             **_test_headers(config, test_run_id)},
                )
                message = str((confirmed or {}).get("message") or "已为您加入购物车。")
                parsed["answer"] = message
                args = action.get("args") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                sku_id = args.get("skuId") if isinstance(args, dict) else None
                if sku_id not in (None, ""):
                    parsed["sources"] = [f"cart:{sku_id}"]
                parsed["actions"].remove(action)
            except AdapterError:
                # 确认失败时保留原始“请确认”回答，让规则/人工看到真实状态
                pass
    return parsed


def send_turn(
    client: httpx.Client,
    config: dict[str, Any],
    token: str,
    session_id: str,
    content: str,
    test_run_id: str = "",
) -> dict[str, Any]:
    """Send one turn, retrying at most twice on business rate limiting."""
    raw_wait = config.get("rateLimitWaitSeconds")
    if raw_wait is None:
        raw_wait = config.get("rate_limit_wait_seconds")
    wait_seconds = float(raw_wait if raw_wait is not None else 120)
    for attempt in range(3):
        try:
            return _send_once(client, config, token, session_id, content, test_run_id)
        except _RateLimited:
            if attempt >= 2:
                raise AdapterError("尚品汇对话限流重试次数超限") from None
            if wait_seconds > 0:
                time.sleep(wait_seconds)
    raise AdapterError("尚品汇对话限流重试次数超限")


def _span(
    span_type: str,
    name: str,
    *,
    status: str = "ok",
    input: dict[str, Any] | None = None,
    output: dict[str, Any] | None = None,
    error: str = "",
    latency_ms: int = 0,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    attributes: dict[str, Any] | None = None,
    parent_span_id: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    start = started_at or now
    end = ended_at or start
    return {
        "id": new_id("SP"),
        "span_type": span_type,
        "name": name,
        "status": status,
        "input": input or {},
        "output": output or {},
        "error": error,
        "latency_ms": latency_ms,
        "started_at": start.isoformat(),
        "ended_at": end.isoformat(),
        "attributes": attributes or {},
        "parent_span_id": parent_span_id,
    }


def _map_status(value: Any, default: str = "ok") -> str:
    text = str(value or "").strip().lower()
    if not text:
        return default
    if text in {"success", "ok", "completed", "finished", "pass", "degraded"}:
        return "ok"
    if text in {"skipped", "skip"}:
        return "skipped"
    return "error"


def _latency_ms(value: Any) -> int:
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _admin_login(client: httpx.Client, config: dict[str, Any]) -> str:
    base = str(config.get("adminBaseUrl") or config.get("admin_base_url") or "").rstrip("/")
    username = str(config.get("adminUsername") or config.get("admin_username") or "")
    password = str(config.get("adminPassword") or config.get("admin_password") or "")
    if not base:
        raise AdapterError("未配置 adminBaseUrl")
    if not username or not password:
        raise AdapterError("未配置 adminUsername/adminPassword")
    data = _json_request(
        client,
        "POST",
        f"{base}/admin/auth/login",
        json={"username": username, "password": password},
    )
    token = data.get("accessToken") if isinstance(data, dict) else None
    if not token:
        raise AdapterError("管理端登录未返回 accessToken")
    return str(token)


def fetch_admin_trace(config: dict[str, Any], run_id: Any) -> tuple[dict[str, Any] | None, str]:
    """Fetch the internal graph trace. Never raises: returns ``(data, error)``."""
    if run_id in (None, ""):
        return None, "本轮没有 runId"
    try:
        with httpx.Client(timeout=_timeout(config)) as client:
            token = _admin_login(client, config)
            data = _json_request(
                client,
                "GET",
                f"{str(config.get('adminBaseUrl') or config.get('admin_base_url')).rstrip('/')}"
                f"/admin/customer-service/agent-runs/{run_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
    except AdapterError as exc:
        return None, str(exc)
    except Exception as exc:  # noqa: BLE001 - admin trace is optional, never block the run
        return None, f"{type(exc).__name__}: {exc}"
    if not isinstance(data, dict) or not data:
        return None, "管理端未返回轨迹数据"
    return data, ""


def _admin_spans(detail: dict[str, Any], parent_span_id: str | None) -> list[dict[str, Any]]:
    """Convert admin run/steps/llmCalls/toolCalls/retrievals into spans."""
    run = detail.get("run") if isinstance(detail.get("run"), dict) else {}
    started = parse_datetime(run.get("startedAt") or run.get("started_at")) or datetime.now(UTC)
    finished = parse_datetime(run.get("finishedAt") or run.get("finished_at"))
    total_latency = _latency_ms(
        (finished - started).total_seconds() * 1000 if finished else run.get("latencyMs")
    )
    agent_span = _span(
        "agent",
        "Agent 执行",
        status=_map_status(run.get("status")),
        input={"message": run.get("input") or ""},
        output={
            "intent": run.get("intent"),
            "agent": run.get("agent"),
            "status": run.get("status"),
            "model": run.get("model"),
        },
        error=str(run.get("error") or ""),
        latency_ms=total_latency,
        started_at=started,
        ended_at=finished or started,
        attributes={
            "runId": run.get("id"),
            "traceId": run.get("traceId"),
            "totalTokens": run.get("totalTokens"),
            "channel": run.get("channel"),
        },
        parent_span_id=parent_span_id,
    )
    spans = [agent_span]
    step_spans: list[dict[str, Any]] = []
    for step in detail.get("steps") or []:
        if not isinstance(step, dict):
            continue
        latency = _latency_ms(step.get("latencyMs"))
        step_started = parse_datetime(step.get("createdAt") or step.get("startedAt")) or started
        step_spans.append(_span(
            "agent",
            f"步骤 · {step.get('node') or step.get('agent') or 'step'}",
            status=_map_status(step.get("status")),
            input={"summary": step.get("inputSummary") or ""},
            output={
                "agent": step.get("agent"),
                "status": step.get("status"),
                "summary": step.get("outputSummary") or "",
            },
            latency_ms=latency,
            started_at=step_started,
            ended_at=step_started + timedelta(milliseconds=latency),
            attributes={"stepId": step.get("id"), "checkpointId": step.get("checkpointId")},
            parent_span_id=agent_span["id"],
        ))
    spans.extend(step_spans)
    parent = step_spans[-1]["id"] if step_spans else agent_span["id"]
    for call in detail.get("llmCalls") or []:
        if not isinstance(call, dict):
            continue
        latency = _latency_ms(call.get("latencyMs"))
        call_started = parse_datetime(call.get("createdAt")) or started
        spans.append(_span(
            "llm",
            f"LLM · {call.get('model') or 'unknown'}",
            status=_map_status(call.get("status")),
            input={"prompt": call.get("requestRef") or ""},
            output={"response": call.get("responseRef") or "", "model": call.get("model") or ""},
            latency_ms=latency,
            started_at=call_started,
            ended_at=call_started + timedelta(milliseconds=latency),
            attributes={
                "usage": {
                    "prompt_tokens": call.get("inputTokens") or 0,
                    "completion_tokens": call.get("outputTokens") or 0,
                },
                "promptVersion": call.get("promptVersion"),
                "finishReason": call.get("finishReason"),
            },
            parent_span_id=parent,
        ))
    for call in detail.get("toolCalls") or []:
        if not isinstance(call, dict):
            continue
        latency = _latency_ms(call.get("latencyMs"))
        call_started = parse_datetime(call.get("createdAt")) or started
        spans.append(_span(
            "tool",
            f"工具 · {call.get('toolName') or 'unknown'}",
            status=_map_status(call.get("status")),
            input={"args": call.get("argsJson") or {}},
            output={"result": call.get("resultJson") or {}},
            error=str(call.get("errorCode") or ""),
            latency_ms=latency,
            started_at=call_started,
            ended_at=call_started + timedelta(milliseconds=latency),
            parent_span_id=parent,
        ))
    for retrieval in detail.get("retrievals") or []:
        if not isinstance(retrieval, dict):
            continue
        latency = _latency_ms(retrieval.get("latencyMs"))
        call_started = parse_datetime(retrieval.get("createdAt")) or started
        doc_ids = retrieval.get("docIds") or []
        scores = retrieval.get("scores") or []
        hits = [
            {"id": doc_id, "score": scores[index] if index < len(scores) else None}
            for index, doc_id in enumerate(doc_ids)
        ]
        spans.append(_span(
            "retrieval",
            f"检索 · {retrieval.get('backend') or 'unknown'}",
            status="ok",
            input={"query": retrieval.get("query") or ""},
            output={"hits": hits, "fallback": not bool(retrieval.get("hit"))},
            latency_ms=latency,
            started_at=call_started,
            ended_at=call_started + timedelta(milliseconds=latency),
            attributes={"topK": retrieval.get("topK"), "hit": retrieval.get("hit")},
            parent_span_id=parent,
        ))
    return spans


def run(
    config: dict[str, Any],
    command: str = "",
    turns: list[str] | None = None,
    payload: dict[str, Any] | None = None,
    test_run_id: str = "",
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Run a multi-turn Shang Pivot conversation.

    Returns ``(trace, conversation)`` where trace is compatible with
    ``trace.normalize_trace`` through its ``custom_spans`` extension.
    """
    turn_list = [str(item).strip() for item in (turns or []) if str(item).strip()]
    if not turn_list:
        turn_list = [str(command or "").strip()]
    if not turn_list or not turn_list[0]:
        raise AdapterError("尚品汇用例缺少多轮输入")

    base_url = _base_url(config)
    raw_throttle = config.get("throttleMs")
    if raw_throttle is None:
        raw_throttle = config.get("throttle_ms")
    throttle_ms = _latency_ms(raw_throttle if raw_throttle is not None else 1200)
    conversation: list[dict[str, Any]] = []
    custom_spans: list[dict[str, Any]] = []
    warnings: list[str] = []
    started_total = time.perf_counter()

    with httpx.Client(timeout=_timeout(config), follow_redirects=True) as client:
        token, _ = login(client, config)
        session_id = create_session(client, config, token, test_run_id)
        if config.get("cartCleanup") or config.get("cart_cleanup"):
            try:
                clear_cart(client, config, token)
            except AdapterError as exc:
                warnings.append(f"购物车清理失败：{exc}")

        for index, content in enumerate(turn_list):
            if index > 0 and throttle_ms > 0:
                time.sleep(throttle_ms / 1000)
            turn_started = datetime.now(UTC)
            timer = time.perf_counter()
            parsed = send_turn(client, config, token, session_id, content, test_run_id)
            latency_ms = max(0, int((time.perf_counter() - timer) * 1000))
            turn_ended = datetime.now(UTC)
            command_span = _span(
                "command",
                f"第 {index + 1} 轮输入",
                input={"turn": content},
                latency_ms=0,
                started_at=turn_started,
                ended_at=turn_started + timedelta(milliseconds=1),
            )
            sse_span = _span(
                "sse",
                f"第 {index + 1} 轮 SSE",
                input={"turn": content},
                output={
                    "answer": parsed["answer"],
                    "cards": parsed["cards"],
                    "sources": parsed["sources"],
                    "tokens": parsed["tokens"],
                    "degraded": parsed["degraded"],
                },
                latency_ms=latency_ms,
                started_at=turn_started + timedelta(milliseconds=1),
                ended_at=turn_ended,
                attributes={
                    "runId": parsed["runId"],
                    "agent": parsed["agent"],
                    "intent": parsed["intent"],
                    "tools": parsed["tools"],
                    "sessionStatus": parsed["sessionStatus"],
                    "actions": parsed["actions"],
                },
                parent_span_id=command_span["id"],
            )
            custom_spans.extend([command_span, sse_span])
            conversation.append({
                "input": content,
                "answer": parsed["answer"],
                "reasoning": parsed["reasoning"],
                "cards": parsed["cards"],
                "sources": parsed["sources"],
                "tokens": parsed["tokens"],
                "degraded": parsed["degraded"],
                "runId": parsed["runId"],
                "agent": parsed["agent"],
                "intent": parsed["intent"],
                "tools": parsed["tools"],
                "sessionStatus": parsed["sessionStatus"],
                "latencyMs": latency_ms,
            })

        last = conversation[-1]
        last_sse_id = custom_spans[-1]["id"] if custom_spans else None
        graph_trace: dict[str, Any] = {"status": "skipped", "runId": last.get("runId"), "error": ""}
        if str(config.get("engine") or "legacy").lower() == "graph":
            detail, error = fetch_admin_trace(config, last.get("runId"))
            if detail:
                try:
                    admin_spans = _admin_spans(detail, last_sse_id)
                except Exception as exc:  # noqa: BLE001 - optional trace must not block the run
                    error = f"{type(exc).__name__}: {exc}"
                    admin_spans = []
                if admin_spans:
                    custom_spans.extend(admin_spans)
                    graph_trace.update({"status": "ok", "error": "", "spanCount": len(admin_spans)})
                else:
                    graph_trace.update({"status": "skipped", "error": error or "内部轨迹为空"})
                    custom_spans.append(_span(
                        "agent",
                        "内部轨迹",
                        status="skipped",
                        output={"runId": last.get("runId"), "error": graph_trace["error"]},
                        error=graph_trace["error"],
                        parent_span_id=last_sse_id,
                    ))
            else:
                graph_trace.update({"status": "skipped", "error": error})
                custom_spans.append(_span(
                    "agent",
                    "内部轨迹",
                    status="skipped",
                    output={"runId": last.get("runId"), "error": error},
                    error=error,
                    parent_span_id=last_sse_id,
                ))

        final_state: dict[str, int] = {}
        if config.get("cartState", config.get("cart_state", True)):
            try:
                final_state = cart_state(client, config, token)
            except AdapterError as exc:
                warnings.append(f"读取购物车失败：{exc}")

    total_latency = max(0, int((time.perf_counter() - started_total) * 1000))
    custom_spans.append(_span(
        "final",
        "最终回答",
        status="ok",
        input={},
        output={
            "answer": last["answer"],
            "cards": last["cards"],
            "sources": last["sources"],
            "status": "ok",
            "tools": last["tools"],
        },
        latency_ms=total_latency,
        parent_span_id=last_sse_id,
    ))
    trace: dict[str, Any] = {
        "message": turn_list[-1],
        "intent": last.get("intent"),
        "agent": last.get("agent"),
        "status": "ok",
        "answer": last.get("answer") or "",
        "cards": last.get("cards") or [],
        "sources": last.get("sources") or [],
        "tokens": last.get("tokens") or {},
        "degraded": bool(last.get("degraded")),
        "run_id": last.get("runId"),
        "runId": last.get("runId"),
        "tools": last.get("tools") or [],
        "conversation": conversation,
        "cart_state": final_state,
        "cartState": final_state,
        "latency_ms": total_latency,
        "custom_spans": custom_spans,
        "graphTrace": graph_trace,
        "warnings": warnings,
    }
    return trace, conversation
