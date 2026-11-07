from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import settings
from .parsing import chunk_text


class LLMUnavailable(RuntimeError):
    pass


class LLMError(RuntimeError):
    pass


def _extract_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMError("模型返回的不是合法 JSON") from exc
    if not isinstance(value, dict):
        raise LLMError("模型返回的 JSON 结构不正确")
    return value


def chat_json(system: str, user: str) -> dict[str, Any]:
    if not settings.llm_api_key:
        raise LLMUnavailable("未配置 LLM_API_KEY，无法执行 AI 生成")
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    try:
        response = httpx.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json=payload,
            timeout=settings.llm_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"模型服务不可达：{exc}") from exc
    if response.status_code >= 400:
        raise LLMError(f"模型服务返回 {response.status_code}")
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError("模型响应结构不正确") from exc
    return _extract_json(content)


def split_requirements(title: str, text: str) -> list[dict[str, Any]]:
    system = (
        "你是需求分析师。把输入需求拆成可独立测试的主/子需求。"
        "只输出 JSON：{\"children\":[{\"title\":\"\",\"description\":\"\",\"priority\":\"P0|P1|P2\",\"points\":[\"\"]}]}。"
        "子需求必须覆盖原文关键流程，不要编造原文没有的功能。"
    )
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for chunk in chunk_text(text):
        data = chat_json(system, f"主需求：{title}\n\n需求内容：\n{chunk}")
        for item in data.get("children", []):
            child_title = str(item.get("title", "")).strip()
            if not child_title or child_title in seen:
                continue
            seen.add(child_title)
            results.append({
                "title": child_title,
                "description": str(item.get("description", "")),
                "priority": item.get("priority") if item.get("priority") in {"P0", "P1", "P2"} else "P1",
                "points": [str(point) for point in item.get("points", []) if str(point).strip()],
            })
            if len(results) >= 50:
                return results
    if not results:
        raise LLMError("模型没有返回任何子需求")
    return results


def generate_testcases(source: str, context: str) -> list[dict[str, Any]]:
    system = (
        "你是测试工程师。基于输入生成测试用例。"
        "只输出 JSON：{\"cases\":[{\"title\":\"\",\"module\":\"\",\"type\":\"正向|边界|异常|安全\","
        "\"priority\":\"P0|P1|P2\",\"precondition\":\"\",\"steps\":[\"\"],\"expected\":\"\"}]}。"
        "覆盖正向、边界、异常与安全，不要生成重复标题。"
    )
    data = chat_json(system, f"输入来源：{source}\n\n上下文：\n{chunk_text(context, 16000)[0]}")
    cases = []
    for item in data.get("cases", []):
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        cases.append({
            "title": title,
            "module": str(item.get("module", "通用")),
            "type": item.get("type") if item.get("type") in {"正向", "边界", "异常", "安全"} else "正向",
            "priority": item.get("priority") if item.get("priority") in {"P0", "P1", "P2"} else "P1",
            "precondition": str(item.get("precondition", "")),
            "steps": [str(step) for step in item.get("steps", []) if str(step).strip()],
            "expected": str(item.get("expected", "")),
        })
    if not cases:
        raise LLMError("模型没有返回任何用例")
    return cases


def chat_text(system: str, user: str, model: str | None = None) -> tuple[str, dict[str, int]]:
    if not settings.llm_api_key:
        raise LLMUnavailable("未配置 LLM_API_KEY，无法执行 AI 对话")
    payload = {
        "model": model or settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    try:
        response = httpx.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json=payload,
            timeout=settings.llm_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"模型服务不可达：{exc}") from exc
    if response.status_code >= 400:
        raise LLMError(f"模型服务返回 {response.status_code}")
    body = response.json()
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError("模型响应结构不正确") from exc
    usage = body.get("usage") or {}
    return str(content), {
        "prompt": int(usage.get("prompt_tokens") or 0),
        "completion": int(usage.get("completion_tokens") or 0),
    }


def _terms(text: str) -> set[str]:
    lowered = text.lower()
    words = set(re.findall(r"[a-z0-9_]{2,}", lowered))
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", lowered))
    bigrams = {chinese[index:index + 2] for index in range(max(0, len(chinese) - 1))}
    return words | bigrams


def relevance_coverage(children: list[dict[str, Any]], text: str) -> float:
    if not children:
        return 0.0
    source = text.lower()
    hits = 0
    for child in children:
        terms = _terms(f"{child.get('title', '')} {child.get('description', '')}")
        if terms and any(term in source for term in terms):
            hits += 1
    return hits / len(children)


def _document_headings(text: str, title: str) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    in_code = False
    normalized_title = re.sub(r"[\s\-_/]+", "", title).lower()
    for raw in text.splitlines():
        if raw.strip().startswith("```"):
            in_code = not in_code
            if current is not None:
                current["body"].append(raw)
            continue
        if in_code:
            if current is not None:
                current["body"].append(raw)
            continue
        heading = re.match(r"^\s{0,3}(#{1,4})\s+(.+?)\s*$", raw)
        if heading:
            level = len(heading.group(1))
            name = re.sub(r"[*_`#]", "", heading.group(2)).strip()
            normalized_name = re.sub(r"[\s\-_/]+", "", name).lower()
            if (
                not name
                or normalized_name == normalized_title
                or normalized_name in normalized_title
                or normalized_title in normalized_name
            ):
                current = None
                continue
            current = {"level": level, "title": name, "body": []}
            collected.append(current)
            continue
        if current is not None:
            current["body"].append(raw)
    level_two = [item for item in collected if item["level"] == 2]
    selected = level_two if len(level_two) >= 3 else [item for item in collected if item["level"] in {2, 3}]
    if not selected:
        selected = [item for item in collected if item["level"] <= 3]
    unique = []
    seen = set()
    for item in selected:
        key = item["title"]
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def local_split_requirements(title: str, text: str) -> list[dict[str, Any]]:
    headings = _document_headings(text, title)
    children: list[dict[str, Any]] = []
    for item in headings:
        body = "\n".join(item["body"])
        prose = re.sub(r"```.*?```", "", body, flags=re.S).strip()
        points = [
            re.sub(r"^\s*[-*+]\s+", "", line).strip()
            for line in prose.splitlines()
            if re.match(r"^\s*[-*+]\s+", line)
        ][:5]
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", prose) if part.strip()]
        description = (paragraphs[0] if paragraphs else prose)[:300]
        if not description and not points:
            description = body.strip()[:300] or "该章节包含实现细节与示例。"
        children.append({
            "title": item["title"][:190],
            "description": description,
            "priority": "P0" if len(children) < 3 or re.search(r"核心|关键|风险|安全", item["title"]) else "P1",
            "points": points,
        })
    if len(children) < 2:
        plain = re.sub(r"```.*?```", "", text, flags=re.S)
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", plain) if len(part.strip()) >= 40]
        if len(paragraphs) < 2:
            sentences = [part.strip() for part in re.split(r"[。！？\n]", plain) if len(part.strip()) >= 20]
            paragraphs = ["".join(sentences[index:index + 3]) for index in range(0, len(sentences), 3)]
        children = []
        for index, paragraph in enumerate(paragraphs[:30]):
            first = re.split(r"[。；;\n]", paragraph)[0].strip()
            children.append({
                "title": (first[:60] or f"需求点 {index + 1}"),
                "description": paragraph[:300],
                "priority": "P0" if index < 3 else "P1",
                "points": [],
            })
    return children[:30]


def extract_headings(text: str, title: str) -> list[str]:
    return [item["title"] for item in _document_headings(text, title)]


def title_similarity(left: str, right: str) -> float:
    a, b = _terms(left), _terms(right)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def heading_alignment(children: list[dict[str, Any]], headings: list[str]) -> int:
    if not headings:
        return len(children)
    aligned = 0
    for child in children:
        score = max((title_similarity(child.get("title", ""), heading) for heading in headings), default=0.0)
        if score >= 0.2:
            aligned += 1
    return aligned
