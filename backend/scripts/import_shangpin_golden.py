"""Import the Shang Pivot Golden Dataset into the Agent test platform.

Usage::

    python backend/scripts/import_shangpin_golden.py \
        --base-url http://127.0.0.1:8000 \
        --email admin@corp.com --password '***' --project ecommerce

    python backend/scripts/import_shangpin_golden.py --smoke ...

``--smoke`` only imports E01/E04/E07/E09/E06.  Shang Pivot demo phones and
SMS code are public demo values; admin credentials are read from arguments or
environment variables and are never hard-coded.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

DATA_FILE = Path(__file__).resolve().parent / "data" / "shangpin_golden.json"
SMOKE_IDS = [
    "E01-presale-phone-budget",
    "E04-addcart",
    "E07-knowledge-refund",
    "E09-injection",
    "E06-order-none",
]
TARGET_NAME = "Shang Pivot 智能客服"


def load_goldens(path: Path | str = DATA_FILE) -> list[dict[str, Any]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Golden 数据必须是数组")
    return data


def build_checks(case: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate deterministic checks from one Golden case."""
    checks: list[dict[str, Any]] = []
    for source in case.get("sources") or []:
        checks.append({"type": "source_contains", "expected": source})
    if case.get("maxSources") is not None:
        checks.append({"type": "max_sources", "expected": int(case["maxSources"])})
    for card in case.get("cards") or []:
        checks.append({"type": "card_contains", "expected": card})
    for cart in case.get("cart") or []:
        checks.append({
            "type": "cart_quantity",
            "expected": {"title": cart.get("title"), "quantity": cart.get("quantity")},
        })
    for keyword in case.get("answerKeywords") or []:
        checks.append({"type": "contains", "expected": keyword})
    for pattern in case.get("forbid") or []:
        checks.append({"type": "forbid_pattern", "expected": pattern})
    checks.append({"type": "degraded_false"})
    return checks


def build_expected(case: dict[str, Any]) -> dict[str, Any]:
    judge = case.get("judge") if isinstance(case.get("judge"), dict) else {}
    return {
        "businessRule": case.get("businessRule") or "",
        "sources": case.get("sources") or [],
        "maxSources": case.get("maxSources"),
        "cards": case.get("cards") or [],
        "cart": case.get("cart") or [],
        "answerKeywords": case.get("answerKeywords") or [],
        "forbid": case.get("forbid") or [],
        "judge": {
            "enabled": bool(judge.get("enabled", True)),
            "threshold": judge.get("threshold", 0.7),
            "steps": judge.get("steps") or [],
        },
    }


def target_config(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """Read target config from environment (public demo phones are defaults)."""
    phones = [
        item.strip()
        for item in os.getenv("SHANGPIN_CUSTOMER_PHONES", "13900009999,13900009998").split(",")
        if item.strip()
    ]
    config = {
        "baseUrl": os.getenv("SHANGPIN_BASE_URL", "https://shang.bettery.cn"),
        "adminBaseUrl": os.getenv("SHANGPIN_ADMIN_BASE_URL", "https://admin.bettery.cn"),
        "customerPhones": phones,
        "smsCode": os.getenv("SHANGPIN_SMS_CODE", "123456"),
        "clientType": os.getenv("SHANGPIN_CLIENT_TYPE", "h5"),
        "throttleMs": int(os.getenv("SHANGPIN_THROTTLE_MS", "1200")),
        "rateLimitWaitSeconds": int(os.getenv("SHANGPIN_RATE_LIMIT_WAIT_SECONDS", "120")),
        "cartCleanup": True,
        "engine": os.getenv("SHANGPIN_ENGINE", "legacy"),
        "adminUsername": os.getenv("SHANGPIN_ADMIN_USERNAME", "admin"),
        "adminPassword": os.getenv("SHANGPIN_ADMIN_PASSWORD", ""),
    }
    for key, value in (overrides or {}).items():
        if value is not None:
            config[key] = value
    return config


class PlatformClient:
    def __init__(self, base_url: str, project: str) -> None:
        self.project = project
        self.http = httpx.Client(base_url=base_url.rstrip("/"), timeout=60)
        self.headers: dict[str, str] = {"X-Project-Id": project}

    def login(self, email: str, password: str) -> None:
        response = self.http.post("/api/v1/auth/login", json={"email": email, "password": password})
        data = self._payload(response)
        token = (data or {}).get("accessToken")
        if not token:
            raise RuntimeError("平台登录未返回 accessToken")
        self.headers["Authorization"] = f"Bearer {token}"

    def _payload(self, response: httpx.Response) -> Any:
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
        try:
            body = response.json()
        except ValueError as exc:
            raise RuntimeError("平台返回非 JSON 内容") from exc
        if isinstance(body, dict) and body.get("code") not in (None, 0, "0"):
            raise RuntimeError(f"平台接口错误：{body.get('message') or body.get('msg') or body.get('code')}")
        return body.get("data") if isinstance(body, dict) else body

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.http.request(method, path, headers=self.headers, **kwargs)
        return self._payload(response)

    def upsert_target(self, name: str, config: dict[str, Any]) -> dict[str, Any]:
        targets = self.request("GET", "/api/v1/agent-test/targets") or []
        existing = next((item for item in targets if item.get("name") == name), None)
        body = {
            "name": name,
            "adapterType": "shangpin",
            "description": "尚品汇 V3.0 智能客服（Phase 1 黑盒 SSE）",
            "config": config,
            "status": "启用",
        }
        if existing:
            return self.request("PUT", f"/api/v1/agent-test/targets/{existing['id']}", json=body)
        return self.request("POST", "/api/v1/agent-test/targets", json=body)

    def upsert_case(self, payload: dict[str, Any], golden_id: str, existing: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
        tag = f"golden:{golden_id}"
        found = next(
            (
                item for item in existing
                if tag in (item.get("tags") or [])
                or str(item.get("name") or "").startswith(golden_id)
            ),
            None,
        )
        if found:
            return self.request("PUT", f"/api/v1/agent-test/cases/{found['id']}", json=payload), "updated"
        return self.request("POST", "/api/v1/agent-test/cases", json=payload), "created"


def case_payload(case: dict[str, Any], target_id: str) -> dict[str, Any]:
    golden_id = str(case["id"])
    turns = [str(item) for item in case.get("turns") or []]
    business_rule = str(case.get("businessRule") or "")
    return {
        "name": f"{golden_id} · {business_rule}"[:200],
        "targetId": target_id,
        "inputType": "text",
        "command": turns[0] if turns else "",
        "turns": turns,
        "payload": {"goldenId": golden_id, "businessRule": business_rule},
        "expected": build_expected(case),
        "checks": build_checks(case),
        "tags": ["shangpin", "golden", golden_id],
        "priority": "P0" if golden_id in SMOKE_IDS else "P1",
        "enabled": True,
        "version": "v1.0",
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入尚品汇 Golden 数据集到 Agent 测试平台")
    parser.add_argument("--base-url", default=os.getenv("PLATFORM_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--email", default=os.getenv("PLATFORM_EMAIL", ""))
    parser.add_argument("--password", default=os.getenv("PLATFORM_PASSWORD", ""))
    parser.add_argument("--project", default=os.getenv("PLATFORM_PROJECT", "ecommerce"))
    parser.add_argument("--target-name", default=TARGET_NAME)
    parser.add_argument("--data", default=str(DATA_FILE))
    parser.add_argument("--smoke", action="store_true", help="只导入 E01/E04/E07/E09/E06")
    parser.add_argument("--shangpin-base-url", default=None)
    parser.add_argument("--shangpin-admin-base-url", default=None)
    parser.add_argument("--shangpin-admin-username", default=None)
    parser.add_argument("--shangpin-admin-password", default=None)
    parser.add_argument("--shangpin-sms-code", default=None)
    parser.add_argument("--shangpin-engine", default=None, choices=["legacy", "graph"])
    parser.add_argument("--customer-phones", default=None, help="逗号分隔的演示手机号")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.email or not args.password:
        print("缺少平台账号：请通过 --email/--password 或 PLATFORM_EMAIL/PLATFORM_PASSWORD 提供", file=sys.stderr)
        return 2
    goldens = load_goldens(args.data)
    if args.smoke:
        by_id = {str(item.get("id")): item for item in goldens}
        selected = [by_id[item] for item in SMOKE_IDS if item in by_id]
    else:
        selected = goldens
    if not selected:
        print("没有匹配的 Golden 用例", file=sys.stderr)
        return 2

    client = PlatformClient(args.base_url, args.project)
    try:
        client.login(args.email, args.password)
        overrides = {
            "baseUrl": args.shangpin_base_url,
            "adminBaseUrl": args.shangpin_admin_base_url,
            "adminUsername": args.shangpin_admin_username,
            "adminPassword": args.shangpin_admin_password,
            "smsCode": args.shangpin_sms_code,
            "engine": args.shangpin_engine,
        }
        if args.customer_phones:
            overrides["customerPhones"] = [
                item.strip() for item in args.customer_phones.split(",") if item.strip()
            ]
        target = client.upsert_target(args.target_name, target_config(overrides))
        existing = client.request("GET", "/api/v1/agent-test/cases") or []
        created = updated = 0
        for case in selected:
            _, action = client.upsert_case(case_payload(case, target["id"]), str(case["id"]), existing)
            created += action == "created"
            updated += action == "updated"
            print(f"[{action}] {case['id']}")
    except (RuntimeError, httpx.HTTPError) as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1
    finally:
        client.http.close()
    print(f"完成：target={target['id']}，共 {len(selected)} 条（新建 {created} / 更新 {updated}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
