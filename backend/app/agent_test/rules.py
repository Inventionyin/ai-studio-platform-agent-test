"""Rule engine for Agent trace evaluation."""
from __future__ import annotations

import json
import re
from typing import Any

PHONE_RE = re.compile(r"(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)")
BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{4,}")
SECRET_HINT_RE = re.compile(r"(?i)\b(api[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*\S+")


def _terms(text: str) -> set[str]:
    lowered = text.lower()
    words = set(re.findall(r"[a-z0-9_]{2,}", lowered))
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", lowered))
    return words | {chinese[index:index + 2] for index in range(max(0, len(chinese) - 1))}


def _answer(trace: dict[str, Any]) -> str:
    final_output = trace.get("final_output")
    if not isinstance(final_output, dict):
        final_output = trace.get("finalOutput")
    if isinstance(final_output, dict) and final_output.get("answer") is not None:
        return str(final_output.get("answer"))
    return str(trace.get("answer") or "")


def _tools(trace: dict[str, Any]) -> list[str]:
    tools = [
        str(item.get("name"))
        for item in trace.get("tool_calls") or []
        if isinstance(item, dict) and item.get("name")
    ]
    if tools:
        return tools
    value = _turn_value(trace, "tools")
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item)]
    return [str(value)] if value not in (None, "") else []


def _retrieval_text(trace: dict[str, Any]) -> str:
    return json.dumps(trace.get("retrievals") or [], ensure_ascii=False)


def _evidence_text(trace: dict[str, Any]) -> str:
    tool_results = [item.get("result") for item in trace.get("tool_calls") or [] if isinstance(item, dict)]
    hits: list[Any] = []
    for retrieval in trace.get("retrievals") or []:
        if isinstance(retrieval, dict):
            hits.extend(retrieval.get("hits") or [])
    return json.dumps({"tools": tool_results, "hits": hits}, ensure_ascii=False)


def _span_ids(spans: list[dict[str, Any]], types: set[str], keyword: str | None = None) -> list[str]:
    result = []
    for span in spans:
        if span.get("span_type") not in types:
            continue
        if keyword and keyword.lower() not in str(span.get("name") or "").lower():
            continue
        result.append(str(span.get("id")))
    return result


def _check(label: str, passed: bool, detail: str, evidence: list[str]) -> dict[str, Any]:
    return {
        "label": label,
        "passed": bool(passed),
        "detail": detail,
        "evidenceSpanIds": evidence,
    }


def _as_list(value: Any) -> list[str]:
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item)]
    return [str(value)] if value not in (None, "") else []


def _turn_value(trace: dict[str, Any], key: str) -> Any:
    """Read a field from the last conversation turn, then final_output/trace."""
    conversation = trace.get("conversation")
    if isinstance(conversation, list) and conversation:
        last = conversation[-1]
        if isinstance(last, dict) and key in last:
            return last.get(key)
    final_output = trace.get("final_output")
    if not isinstance(final_output, dict):
        final_output = trace.get("finalOutput")
    if isinstance(final_output, dict) and key in final_output:
        return final_output.get(key)
    return trace.get(key)


def _sources(trace: dict[str, Any]) -> list[str]:
    raw = _turn_value(trace, "sources")
    result: list[str] = []
    for item in raw or []:
        if isinstance(item, dict):
            text = item.get("source") or item.get("name") or item.get("id")
            result.append(str(text) if text not in (None, "") else json.dumps(item, ensure_ascii=False))
        elif item not in (None, ""):
            result.append(str(item))
    return result


def _cards(trace: dict[str, Any]) -> list[Any]:
    raw = _turn_value(trace, "cards")
    return list(raw) if isinstance(raw, (list, tuple)) else []


def _card_text(card: Any) -> str:
    if isinstance(card, dict):
        parts = [
            str(card.get(key))
            for key in ("name", "title", "spuName", "subtitle")
            if card.get(key) not in (None, "")
        ]
        if parts:
            return " ".join(parts)
        return json.dumps(card, ensure_ascii=False)
    return str(card)


def _degraded(trace: dict[str, Any]) -> bool:
    value = _turn_value(trace, "degraded")
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "是"}
    return bool(value)


def _cart_state(trace: dict[str, Any]) -> dict[str, int]:
    raw = _turn_value(trace, "cartState")
    if raw in (None, {}):
        raw = _turn_value(trace, "cart_state")
    state: dict[str, int] = {}
    if isinstance(raw, dict):
        for title, quantity in raw.items():
            try:
                state[str(title)] = int(float(quantity or 0))
            except (TypeError, ValueError):
                state[str(title)] = 0
    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or item.get("name") or "")
            if not title:
                continue
            try:
                quantity = int(float(item.get("quantity") or 0))
            except (TypeError, ValueError):
                quantity = 0
            state[title] = state.get(title, 0) + quantity
    return state


def _latency_passed(actual: int, expected: Any) -> bool:
    match = re.match(r"^\s*(<=|>=|<|>)?\s*(\d+(?:\.\d+)?)", str(expected))
    if not match:
        return False
    operator = match.group(1) or "<"
    target = float(match.group(2))
    return {
        "<": actual < target,
        "<=": actual <= target,
        ">": actual > target,
        ">=": actual >= target,
    }[operator]


def _grounded(answer: str, evidence: str) -> tuple[bool, str]:
    sentences = [part.strip() for part in re.split(r"[。！？!?;\n]+", answer) if part.strip()]
    if not sentences:
        return False, "回答为空，无法校验事实"
    evidence_terms = _terms(evidence)
    if not evidence_terms:
        return False, "没有可用的工具或检索证据"
    missing = []
    for sentence in sentences:
        terms = _terms(sentence)
        if not terms:
            continue
        coverage = len(terms & evidence_terms) / len(terms)
        if coverage < 0.3:
            missing.append(sentence[:60])
    if missing:
        return False, f"以下内容缺少证据：{'；'.join(missing)}"
    return True, "回答中的事实均可在工具/检索证据中找到"


def _default_checks(expected: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    if expected.get("status"):
        checks.append({"type": "status", "expected": expected["status"]})
    if expected.get("intent"):
        checks.append({"type": "intent", "expected": expected["intent"]})
    if expected.get("agent"):
        checks.append({"type": "agent", "expected": expected["agent"]})
    for tool in _as_list(expected.get("tools")):
        checks.append({"type": "tool_called", "expected": tool})
    if expected.get("retrieval"):
        checks.append({"type": "retrieval_hit", "expected": expected["retrieval"]})
    if expected.get("answer"):
        checks.append({"type": "contains", "expected": expected["answer"]})
    return checks


def evaluate_rules(
    trace: dict[str, Any],
    expected: dict[str, Any] | None,
    checks: list[dict[str, Any]] | None,
    spans: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run configured rule checks and return verdict/score/checks."""
    span_rows = spans or []
    expected = expected if isinstance(expected, dict) else {}
    configured = [item for item in (checks or []) if isinstance(item, dict)]
    if not configured:
        configured = _default_checks(expected)

    answer = _answer(trace)
    actual_status = str(trace.get("status") or "")
    agent_output = trace.get("agent_output") if isinstance(trace.get("agent_output"), dict) else {}
    actual_intent = str(trace.get("intent") or agent_output.get("intent") or "")
    actual_agent = str(trace.get("agent") or agent_output.get("agent") or "")
    tool_names = _tools(trace)
    retrieval_text = _retrieval_text(trace)
    evidence_text = _evidence_text(trace)
    sources = _sources(trace)
    cards = _cards(trace)
    cart = _cart_state(trace)
    final_ids = _span_ids(span_rows, {"final"})
    agent_ids = _span_ids(span_rows, {"agent"})
    retrieval_ids = _span_ids(span_rows, {"retrieval"})

    results: list[dict[str, Any]] = []
    for check in configured:
        check_type = str(check.get("type") or check.get("check") or "").strip().lower()
        target = check.get("expected")
        if target is None:
            target = check.get("value")
        if check_type == "status":
            passed = actual_status == str(target)
            results.append(_check("最终状态", passed, f"实际 {actual_status or '-'} / 期望 {target}", agent_ids))
        elif check_type == "intent":
            passed = actual_intent == str(target)
            results.append(_check("意图识别", passed, f"实际 {actual_intent or '-'} / 期望 {target}", agent_ids))
        elif check_type == "agent":
            passed = actual_agent == str(target)
            results.append(_check("Agent 路由", passed, f"实际 {actual_agent or '-'} / 期望 {target}", agent_ids))
        elif check_type == "tool_called":
            required = _as_list(target)
            missing = [tool for tool in required if tool not in tool_names]
            passed = bool(required) and not missing
            detail = f"已调用 {', '.join(tool_names) or '无'} / 期望 {', '.join(required)}"
            results.append(_check("工具调用", passed, detail, _span_ids(span_rows, {"tool"})))
        elif check_type == "tool_not_called":
            forbidden = _as_list(target)
            called = [tool for tool in forbidden if tool in tool_names]
            passed = not called
            detail = f"禁止调用 {', '.join(forbidden) or '-'} / 实际 {', '.join(tool_names) or '无'}"
            results.append(_check("工具禁用", passed, detail, _span_ids(span_rows, {"tool"})))
        elif check_type == "retrieval_hit":
            hits = []
            for retrieval in trace.get("retrievals") or []:
                if isinstance(retrieval, dict):
                    hits.extend(retrieval.get("hits") or [])
            keyword = str(target or "").strip()
            passed = bool(hits) and (not keyword or keyword.lower() in retrieval_text.lower())
            detail = f"检索命中 {len(hits)} 条" + (f" / 关键词 {keyword}" if keyword else "")
            results.append(_check("检索命中", passed, detail, retrieval_ids))
        elif check_type == "contains":
            expected_text = str(target or "")
            passed = bool(expected_text) and expected_text.lower() in answer.lower()
            results.append(_check("回答包含", passed, f"期望包含「{expected_text}」", final_ids))
        elif check_type == "not_contains":
            expected_text = str(target or "")
            passed = bool(expected_text) and expected_text.lower() not in answer.lower()
            results.append(_check("回答不包含", passed, f"期望不包含「{expected_text}」", final_ids))
        elif check_type == "regex":
            try:
                passed = re.search(str(target or ""), answer, re.I | re.S) is not None
                detail = f"正则 {target}"
            except re.error as exc:
                passed = False
                detail = f"正则无效：{exc}"
            results.append(_check("回答正则", passed, detail, final_ids))
        elif check_type == "latency":
            latency = int(trace.get("latency_ms") or 0)
            passed = _latency_passed(latency, target)
            results.append(_check("执行耗时", passed, f"实际 {latency}ms / 期望 {target}ms", final_ids))
        elif check_type == "no_secret":
            text = answer
            found = bool(PHONE_RE.search(text) or BEARER_RE.search(text) or SECRET_HINT_RE.search(text))
            results.append(_check("敏感信息", not found, "未发现手机号或 Token" if not found else "发现疑似手机号或 Token", final_ids))
        elif check_type == "grounded":
            passed, detail = _grounded(answer, evidence_text)
            results.append(_check("事实有据", passed, detail, final_ids))
        elif check_type == "source_contains":
            expected_text = str(target or "").strip()
            if expected_text.lower() == "retrieval":
                passed = any(re.search(r"vector|lexical|retrieval", source, re.I) for source in sources)
                detail = f"实际 sources {sources or '无'} / 期望包含 retrieval(vector|lexical|retrieval)"
            else:
                passed = bool(expected_text) and any(expected_text.lower() in source.lower() for source in sources)
                detail = f"实际 sources {sources or '无'} / 期望包含「{expected_text}」"
            results.append(_check("来源包含", passed, detail, retrieval_ids))
        elif check_type == "source_not_contains":
            expected_text = str(target or "").strip()
            if expected_text.lower() == "retrieval":
                hit = any(re.search(r"vector|lexical|retrieval", source, re.I) for source in sources)
                detail = f"实际 sources {sources or '无'} / 禁止 retrieval(vector|lexical|retrieval)"
            else:
                hit = any(expected_text.lower() in source.lower() for source in sources)
                detail = f"实际 sources {sources or '无'} / 禁止包含「{expected_text}」"
            results.append(_check("来源不包含", bool(expected_text) and not hit, detail, retrieval_ids))
        elif check_type == "card_contains":
            expected_text = str(target or "").strip()
            passed = bool(expected_text) and any(
                expected_text.lower() in _card_text(card).lower() for card in cards
            )
            results.append(_check("卡片包含", passed, f"实际卡片 {[_card_text(card) for card in cards] or '无'} / 期望包含「{expected_text}」", final_ids))
        elif check_type == "card_not_contains":
            expected_text = str(target or "").strip()
            hit = any(expected_text.lower() in _card_text(card).lower() for card in cards)
            results.append(_check("卡片不包含", bool(expected_text) and not hit, f"实际卡片 {[_card_text(card) for card in cards] or '无'} / 禁止包含「{expected_text}」", final_ids))
        elif check_type == "cart_quantity":
            entries = target if isinstance(target, list) else [target]
            passed = True
            details: list[str] = []
            for entry in entries:
                if not isinstance(entry, dict):
                    passed = False
                    details.append(f"无效期望 {entry}")
                    continue
                title = str(entry.get("title") or entry.get("name") or "").strip()
                try:
                    expected_quantity = int(float(entry.get("quantity") or 0))
                except (TypeError, ValueError):
                    expected_quantity = 0
                actual_quantity = sum(
                    quantity for name, quantity in cart.items()
                    if title and title.lower() in name.lower()
                )
                if not title or actual_quantity != expected_quantity:
                    passed = False
                details.append(f"{title or '-'} 实际 {actual_quantity} / 期望 {expected_quantity}")
            results.append(_check("购物车数量", passed, "；".join(details), final_ids))
        elif check_type == "forbid_pattern":
            expected_text = str(target or "")
            passed = bool(expected_text) and expected_text.lower() not in answer.lower()
            results.append(_check("禁止模式", passed, f"回答中禁止出现「{expected_text}」", final_ids))
        elif check_type == "max_sources":
            try:
                limit = int(float(target))
            except (TypeError, ValueError):
                limit = -1
            passed = limit >= 0 and len(sources) <= limit
            results.append(_check("来源数量上限", passed, f"实际 {len(sources)} / 上限 {limit}", retrieval_ids))
        elif check_type == "degraded_false":
            passed = not _degraded(trace)
            results.append(_check("未降级", passed, f"degraded={_degraded(trace)} / 期望 false", final_ids))
        else:
            results.append(_check(f"未知检查 {check_type or '-'}", False, "不支持的检查类型", []))

    total = len(results)
    passed_count = sum(1 for item in results if item["passed"])
    score = round(passed_count / total, 4) if total else 1.0
    return {
        "verdict": "pass" if total == 0 or passed_count == total else "fail",
        "score": score,
        "checks": results,
    }
