"""LLM Judge for Agent trace evaluation (rule engine lives in rules.py)."""
from __future__ import annotations

import json
import re
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from ..config import settings
from ..trace import Span
from .rules import evaluate_rules

__all__ = [
    "evaluate_rules",
    "evaluate_llm",
    "build_judge_prompt",
    "call_judge_model",
    "normalize_judge_payload",
    "JudgeError",
]

VERDICTS = {"pass", "fail", "needs_review"}
JUDGE_SYSTEM = (
    "你是 Agent 测试评审器。只输出一个 JSON 对象，不要输出 Markdown、标题或任何解释。"
    "格式：{\"verdict\":\"pass|fail|needs_review\",\"score\":0.0,\"reasons\":[\"\"],"
    "\"evidence\":[\"\"],\"missing_facts\":[\"\"],\"hallucination\":false}。"
    "verdict 只能是 pass、fail、needs_review；证据不足时必须用 needs_review。"
)
JUDGE_TOOL = {
    "type": "function",
    "function": {
        "name": "submit_evaluation",
        "description": "提交 Agent 反馈的评审结果",
        "parameters": {
            "type": "object",
            "properties": {
                "verdict": {"type": "string", "enum": ["pass", "fail", "needs_review"]},
                "score": {"type": "number", "minimum": 0, "maximum": 1},
                "reasons": {"type": "array", "items": {"type": "string"}},
                "evidence": {"type": "array", "items": {"type": "string"}},
                "missing_facts": {"type": "array", "items": {"type": "string"}},
                "hallucination": {"type": "boolean"},
            },
            "required": ["verdict", "score", "reasons"],
        },
    },
}
FAIL_WORDS = ("不通过", "未通过", "失败", "错误", "不合格", "fail", "failed", "wrong")
REVIEW_WORDS = ("待复核", "需人工", "人工复核", "证据不足", "无法判定", "部分通过", "needs_review", "review")
PASS_WORDS = ("通过", "正确", "成功", "合格", "pass", "passed", "ok")


class JudgeError(RuntimeError):
    def __init__(self, message: str, raw: str = "") -> None:
        super().__init__(message)
        self.raw = raw


def _normalize_verdict(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    if not text:
        return None
    if any(word in text for word in FAIL_WORDS):
        return "fail"
    if any(word in text for word in REVIEW_WORDS):
        return "needs_review"
    if any(word in text for word in PASS_WORDS):
        return "pass"
    return None


def _as_text_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if value in (None, ""):
        return []
    return [str(value)]


def _normalize_score(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        text = str(value).strip().rstrip("%")
        score = float(text)
    except (TypeError, ValueError):
        return None
    if 1 < score <= 100:
        score /= 100
    return max(0.0, min(1.0, score))


def _normalize_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "yes", "1", "是", "有", "存在"}:
        return True
    if text in {"false", "no", "0", "否", "无", "不存在"}:
        return False
    return None


def normalize_judge_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize English/Chinese LLM judge payloads to the internal schema."""
    verdict = _normalize_verdict(
        data.get("verdict", data.get("判定", data.get("结论", data.get("结果"))))
    )
    reasons = _as_text_list(data.get("reasons", data.get("原因", data.get("理由", data.get("说明")))))
    if verdict is None:
        joined = " ".join(reasons).lower()
        if any(word in joined for word in FAIL_WORDS):
            verdict = "fail"
        elif any(word in joined for word in REVIEW_WORDS):
            verdict = "needs_review"
        elif any(word in joined for word in PASS_WORDS):
            verdict = "pass"
        else:
            verdict = "needs_review"
    missing_facts = _as_text_list(data.get("missing_facts", data.get("缺失事实")))
    return {
        **data,
        "verdict": verdict,
        "score": _normalize_score(data.get("score", data.get("分数", data.get("得分")))),
        "reasons": reasons,
        "evidence": _as_text_list(data.get("evidence", data.get("证据"))),
        "missing_facts": missing_facts,
        "hallucination": _normalize_bool(data.get("hallucination", data.get("幻觉"))),
    }


def _extract_json(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    candidates = [text]
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start:end + 1])
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise JudgeError("Judge 返回的不是合法 JSON", raw=content)


def call_judge_model(system: str, user: str) -> tuple[dict[str, Any], str]:
    """Call an OpenAI-compatible chat completion endpoint in JSON mode."""
    if not settings.judge_api_key:
        raise JudgeError("未配置 JUDGE_API_KEY")
    payload = {
        "model": settings.judge_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "tools": [JUDGE_TOOL],
        "tool_choice": {"type": "function", "function": {"name": "submit_evaluation"}},
        "max_tokens": settings.judge_max_tokens,
    }
    last_raw = ""
    for attempt in range(2):
        try:
            response = httpx.post(
                f"{settings.judge_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.judge_api_key}"},
                json=payload,
                timeout=settings.judge_timeout_seconds,
            )
        except httpx.HTTPError as exc:
            raise JudgeError(f"Judge 服务不可达：{exc}") from exc
        if response.status_code >= 400:
            raise JudgeError(f"Judge 服务返回 {response.status_code}", raw=response.text)
        try:
            message = response.json()["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise JudgeError("Judge 响应结构不正确") from exc

        # Prefer forced function-calling; some OpenAI-compatible gateways
        # occasionally return only reasoning_content with no tool_calls.
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            try:
                arguments = tool_calls[0]["function"]["arguments"]
            except (KeyError, IndexError, TypeError) as exc:
                raise JudgeError("Judge tool_calls 结构不正确") from exc
            content = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                last_raw = content
                if attempt == 0:
                    continue
                raise JudgeError("Judge tool_calls 参数不是合法 JSON", raw=content) from None
            if not isinstance(data, dict):
                last_raw = content
                if attempt == 0:
                    continue
                raise JudgeError("Judge tool_calls 参数不是对象", raw=content)
            return data, content

        content = message.get("content")
        if not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False) if content is not None else ""
        if content.strip():
            try:
                return _extract_json(content), content
            except JudgeError:
                last_raw = content[:4000]
                if attempt == 0:
                    continue
                raise
        last_raw = json.dumps(message, ensure_ascii=False)[:4000]

    raise JudgeError("Judge 返回为空", raw=last_raw)


def build_judge_prompt(run: dict[str, Any], case: dict[str, Any], spans: list[dict[str, Any]]) -> str:
    tool_spans = [
        {"name": span.get("name"), "output": span.get("output")}
        for span in spans
        if span.get("span_type") == "tool"
    ]
    retrieval_spans = [
        {"name": span.get("name"), "output": span.get("output")}
        for span in spans
        if span.get("span_type") == "retrieval"
    ]
    expected = case.get("expected") or {}
    judge = expected.get("judge") if isinstance(expected.get("judge"), dict) else {}
    payload = {
        "case": {
            "name": case.get("name"),
            "command": case.get("command"),
            "turns": case.get("turns") or [],
            "expected": expected,
            "judge": {
                "enabled": bool(judge.get("enabled", True)),
                "threshold": judge.get("threshold", 0.7),
                "steps": judge.get("steps") or [],
            },
            "checks": case.get("checks") or [],
        },
        "run": {
            "status": run.get("status"),
            "final_output": run.get("final_output") or {},
            "conversation": run.get("conversation") or [],
            "verdict": run.get("verdict") or {},
        },
        "evidence": {"tools": tool_spans, "retrievals": retrieval_spans},
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def evaluate_llm(
    run: dict[str, Any],
    case: dict[str, Any],
    spans: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run LLM judge and return evaluation payload plus a judge span."""
    prompt = build_judge_prompt(run, case, spans)
    model = settings.judge_model
    started_at = datetime.now(UTC)
    started = time.perf_counter()
    verdict = "unavailable"
    score: float | None = None
    comment = ""
    response_text = ""
    data: dict[str, Any] = {}
    error = ""
    if not settings.judge_api_key:
        comment = "未配置 JUDGE_API_KEY，无法执行 LLM Judge"
    else:
        try:
            data, response_text = call_judge_model(JUDGE_SYSTEM, prompt)
            data = normalize_judge_payload(data)
            candidate = str(data.get("verdict") or "")
            verdict = candidate if candidate in VERDICTS else "needs_review"
            score = data.get("score")
            reasons = data.get("reasons") or []
            if isinstance(reasons, list):
                comment = "；".join(str(item) for item in reasons)
            else:
                comment = str(reasons)
        except Exception as exc:  # noqa: BLE001 - judge failures must not break runs
            verdict = "unavailable"
            error = str(exc)
            response_text = getattr(exc, "raw", "") or response_text
            comment = f"LLM Judge 调用失败：{exc}"
    latency = int((time.perf_counter() - started) * 1000)
    check = {
        "label": "LLM Judge",
        "passed": verdict == "pass",
        "detail": comment or verdict,
        "evidenceSpanIds": [],
    }
    judge_span = Span(
        span_type="judge",
        name="LLM Judge",
        status="skipped" if not settings.judge_api_key else ("ok" if not error else "error"),
        input={"prompt": prompt},
        output={
            "verdict": verdict,
            "score": score,
            "reasons": data.get("reasons") or [],
            "missing_facts": data.get("missing_facts") or [],
            "hallucination": data.get("hallucination"),
            "raw": response_text,
        },
        error=error,
        latency_ms=latency,
        started_at=started_at,
        ended_at=datetime.now(UTC),
    )
    return {
        "evaluation": {
            "evaluator_type": "llm",
            "verdict": verdict,
            "score": score,
            "checks": [check],
            "comment": comment,
            "model": model,
            "prompt": prompt,
            "response": response_text,
        },
        "span": judge_span,
        "model": model,
        "prompt": prompt,
        "response": response_text,
    }
