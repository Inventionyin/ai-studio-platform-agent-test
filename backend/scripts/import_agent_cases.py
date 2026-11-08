"""Import v32-200 Golden cases into the AI test platform.

Input: JSON array or JSONL.  The script accepts the Java GoldenCase field
names directly:

    id, businessRule, turns,
    expectedSourceFragments, maxSourceCount, expectedCardFragments,
    expectedCart, expectedAnswerKeywords, forbidPatterns,
    judge, judgeThreshold, evaluationSteps

It maps them to platform ``expected`` / ``checks`` and upserts cases by
``payload.sourceId``.  No intent/agent/tools/status fields are invented.

Examples:
    python backend/scripts/import_agent_cases.py --file golden-200.jsonl \\
      --base-url https://agent.bettery.cn/api/v1 \\
      --project ecommerce --email ... --password ... \\
      --target-name "电商客服 Agent" --adapter shangpin --all

    python backend/scripts/import_agent_cases.py --file golden-200.jsonl \\
      --ids E01,E02,E04,E05,E06,E07,E08,E09,E13,E17

    python backend/scripts/import_agent_cases.py --file golden-200.jsonl \\
      --ids-file core-20.ids --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

import httpx

DEFAULT_TARGET_NAME = "电商客服 Agent"
DEFAULT_DATASET_VERSION = "v32-200"


def load_cases(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".jsonl":
        cases = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        data = json.loads(text)
        if isinstance(data, dict):
            data = data.get("cases") or data.get("items") or [data]
        if not isinstance(data, list):
            raise ValueError("输入必须是 JSON 数组、JSONL，或包含 cases/items 的对象")
        cases = data
    if not all(isinstance(item, dict) for item in cases):
        raise ValueError("每条用例必须是 JSON 对象")
    return cases


def _list(value: Any) -> list[Any]:
    if isinstance(value, (list, tuple)):
        return list(value)
    if value in (None, ""):
        return []
    return [value]


def source_id(case: dict[str, Any]) -> str:
    value = case.get("id") or case.get("caseId") or case.get("sourceId")
    if value in (None, ""):
        raise ValueError(f"用例缺少 id/caseId/sourceId：{case.get('name') or case}")
    return str(value)


def judge_config(case: dict[str, Any]) -> dict[str, Any]:
    raw = case.get("judge")
    if isinstance(raw, dict):
        enabled = bool(raw.get("enabled", True))
        threshold = raw.get("threshold", case.get("judgeThreshold", 0.7))
        steps = raw.get("steps", case.get("evaluationSteps") or [])
    else:
        steps = case.get("evaluationSteps") or []
        threshold = case.get("judgeThreshold", 0.7)
        enabled = bool(raw) if raw is not None else bool(steps)
    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        threshold = 0.7
    return {
        "enabled": enabled,
        "threshold": max(0.0, min(1.0, threshold)),
        "steps": [str(item) for item in _list(steps) if str(item).strip()],
    }


def build_checks(case: dict[str, Any]) -> list[dict[str, Any]]:
    """Map the nine GoldenCase expectation fields to platform checks."""
    # If the input is already in platform format, respect it rather than
    # silently dropping custom checks.
    if isinstance(case.get("checks"), list) and case["checks"]:
        return case["checks"]

    checks: list[dict[str, Any]] = []
    for source in _list(case.get("expectedSourceFragments")):
        checks.append({"type": "source_contains", "expected": str(source)})
    if case.get("maxSourceCount") is not None:
        checks.append({"type": "max_sources", "expected": int(case["maxSourceCount"])})
    for card in _list(case.get("expectedCardFragments")):
        checks.append({"type": "card_contains", "expected": str(card)})
    for cart in _list(case.get("expectedCart")):
        if isinstance(cart, dict):
            checks.append({
                "type": "cart_quantity",
                "expected": {
                    "title": str(cart.get("title") or cart.get("name") or ""),
                    "quantity": int(cart.get("quantity") or 0),
                },
            })
    for keyword in _list(case.get("expectedAnswerKeywords")):
        checks.append({"type": "contains", "expected": str(keyword)})
    for pattern in _list(case.get("forbidPatterns")):
        checks.append({"type": "forbid_pattern", "expected": str(pattern)})
    return checks


def build_expected(case: dict[str, Any]) -> dict[str, Any]:
    # Keep platform format if supplied.  For v32-200 only judge metadata is
    # required; we intentionally do not invent intent/agent/tools/status.
    if isinstance(case.get("expected"), dict) and case["expected"]:
        expected = dict(case["expected"])
    else:
        expected = {}
    expected["businessRule"] = str(case.get("businessRule") or expected.get("businessRule") or "")
    expected["judge"] = judge_config(case)
    return expected


def case_payload(case: dict[str, Any], target_id: str, dataset_version: str) -> dict[str, Any]:
    sid = source_id(case)
    turns = [str(item) for item in _list(case.get("turns")) if str(item).strip()]
    if not turns:
        command = str(case.get("command") or "").strip()
        turns = [command] if command else []
    if not turns:
        raise ValueError(f"用例 {sid} 没有 turns/command")
    name = str(case.get("name") or f"{sid} · {case.get('businessRule') or ''}").strip()
    tags = [f"golden:{sid}", f"dataset:{dataset_version}"]
    tags.extend(str(item) for item in _list(case.get("tags")) if str(item).strip())
    tags = list(dict.fromkeys(tags))
    priority = str(case.get("priority") or ("P0" if "suite:core" in tags else "P1"))
    return {
        "name": name[:200],
        "targetId": target_id,
        "inputType": str(case.get("inputType") or "text"),
        "command": turns[0],
        "turns": turns,
        "payload": {
            "sourceId": sid,
            "businessRule": str(case.get("businessRule") or ""),
            "datasetVersion": dataset_version,
            "sourceTags": [str(item) for item in _list(case.get("tags"))],
        },
        "expected": build_expected(case),
        "checks": build_checks(case),
        "tags": tags,
        "priority": priority if priority in {"P0", "P1", "P2"} else "P1",
        "enabled": bool(case.get("enabled", True)),
        "version": str(case.get("version") or "v1.0"),
    }


class PlatformClient:
    def __init__(self, base_url: str, project: str) -> None:
        base = base_url.rstrip("/")
        if not base.endswith("/api/v1"):
            base += "/api/v1"
        self.api = base
        self.project = project
        self.http = httpx.Client(timeout=60)
        self.headers: dict[str, str] = {"X-Project-Id": project}

    def login(self, email: str, password: str) -> None:
        data = self._request("POST", "/auth/login", json={"email": email, "password": password})
        token = (data or {}).get("accessToken")
        if not token:
            raise RuntimeError("平台登录未返回 accessToken")
        self.headers["Authorization"] = f"Bearer {token}"

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.http.request(method, self.api + path, headers=self.headers, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:400]}")
        try:
            body = response.json()
        except ValueError as exc:
            raise RuntimeError("平台返回非 JSON 内容") from exc
        if isinstance(body, dict) and body.get("code") not in (None, 0, "0"):
            raise RuntimeError(f"平台接口错误：{body.get('message') or body.get('msg') or body.get('code')}")
        return body.get("data") if isinstance(body, dict) else body

    def upsert_target(self, name: str, adapter: str, config: dict[str, Any]) -> dict[str, Any]:
        targets = self._request("GET", "/agent-test/targets") or []
        existing = next((item for item in targets if item.get("name") == name), None)
        body = {
            "name": name,
            "adapterType": adapter,
            "description": "v32-200 Golden 接入",
            "config": config,
            "status": "启用",
        }
        if existing:
            return self._request("PUT", f"/agent-test/targets/{existing['id']}", json=body)
        return self._request("POST", "/agent-test/targets", json=body)

    def list_cases(self) -> list[dict[str, Any]]:
        return self._request("GET", "/agent-test/cases") or []

    def upsert_case(self, payload: dict[str, Any], existing: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
        sid = payload["payload"]["sourceId"]
        found = next(
            (
                item for item in existing
                if (item.get("payload") or {}).get("sourceId") == sid
                or f"golden:{sid}" in (item.get("tags") or [])
            ),
            None,
        )
        if found:
            return self._request("PUT", f"/agent-test/cases/{found['id']}", json=payload), "updated"
        return self._request("POST", "/agent-test/cases", json=payload), "created"

    def disable_missing(self, source_ids: set[str], dataset_version: str) -> int:
        changed = 0
        for item in self.list_cases():
            payload = item.get("payload") or {}
            if payload.get("datasetVersion") != dataset_version:
                continue
            if payload.get("sourceId") in source_ids:
                continue
            if item.get("enabled") is False:
                continue
            self._request("PUT", f"/agent-test/cases/{item['id']}", json={"enabled": False})
            changed += 1
        return changed

    def close(self) -> None:
        self.http.close()


def _split(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def select_cases(cases: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    selected = cases
    ids = set(_split(args.ids))
    if args.ids_file:
        ids.update(
            line.strip()
            for line in Path(args.ids_file).read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
    if ids:
        selected = [case for case in selected if source_id(case) in ids]
    if args.tag:
        selected = [
            case for case in selected
            if args.tag in [str(item) for item in _list(case.get("tags"))]
        ]
    if args.limit is not None:
        selected = selected[: max(0, args.limit)]
    return selected


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入 v32-200 Golden 用例")
    parser.add_argument("--file", required=True)
    parser.add_argument("--base-url", default=os.getenv("PLATFORM_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--project", default=os.getenv("PLATFORM_PROJECT", "ecommerce"))
    parser.add_argument("--email", default=os.getenv("PLATFORM_EMAIL", ""))
    parser.add_argument("--password", default=os.getenv("PLATFORM_PASSWORD", ""))
    parser.add_argument("--target-name", default=DEFAULT_TARGET_NAME)
    parser.add_argument("--adapter", default="shangpin")
    parser.add_argument("--dataset-version", default=DEFAULT_DATASET_VERSION)
    parser.add_argument("--ids", default="")
    parser.add_argument("--ids-file", default="")
    parser.add_argument("--tag", default="")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--disable-missing", action="store_true")
    parser.add_argument("--agent-base-url", default=os.getenv("AGENT_BASE_URL", "https://shang.bettery.cn"))
    parser.add_argument("--customer-phones", default=os.getenv("AGENT_CUSTOMER_PHONES", "13900009999,13900009998"))
    parser.add_argument("--sms-code", default=os.getenv("AGENT_SMS_CODE", "123456"))
    parser.add_argument("--engine", default=os.getenv("AGENT_ENGINE", "graph"))
    parser.add_argument("--timeout", type=float, default=150.0)
    parser.add_argument("--throttle-ms", type=int, default=1200)
    parser.add_argument("--rate-limit-wait-seconds", type=int, default=120)
    parser.add_argument("--target-config", default="{}")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.email or not args.password:
        print("缺少平台账号：--email/--password 或 PLATFORM_EMAIL/PLATFORM_PASSWORD", file=sys.stderr)
        return 2
    cases = load_cases(Path(args.file))
    selected = select_cases(cases, args)
    if not selected:
        print("没有匹配的用例", file=sys.stderr)
        return 2

    config = {
        "baseUrl": args.agent_base_url,
        "customerPhones": _split(args.customer_phones),
        "smsCode": args.sms_code,
        "clientType": "h5",
        "throttleMs": args.throttle_ms,
        "rateLimitWaitSeconds": args.rate_limit_wait_seconds,
        "cartCleanup": True,
        "cartState": True,
        "engine": args.engine,
        "timeout": args.timeout,
    }
    overrides = json.loads(args.target_config or "{}")
    if isinstance(overrides, dict):
        config.update(overrides)

    if args.dry_run:
        for case in selected:
            payload = case_payload(case, "AT-dry-run", args.dataset_version)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"[dry-run] {len(selected)} 条；未调用平台")
        return 0

    client = PlatformClient(args.base_url, args.project)
    try:
        client.login(args.email, args.password)
        target = client.upsert_target(args.target_name, args.adapter, config)
        existing = client.list_cases()
        created = updated = 0
        source_ids: set[str] = set()
        for case in selected:
            payload = case_payload(case, target["id"], args.dataset_version)
            source_ids.add(payload["payload"]["sourceId"])
            _, action = client.upsert_case(payload, existing)
            created += action == "created"
            updated += action == "updated"
            print(f"[{action}] {payload['payload']['sourceId']}")
        disabled = client.disable_missing(source_ids, args.dataset_version) if args.disable_missing else 0
        print(
            f"完成：target={target['id']}，输入 {len(selected)} 条，"
            f"新建 {created} / 更新 {updated} / 禁用 {disabled}"
        )
        return 0
    except (RuntimeError, httpx.HTTPError, ValueError) as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
