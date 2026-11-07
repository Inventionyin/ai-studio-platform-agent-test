"""Run the 5-case Shang Pivot smoke suite against a remote deployment.

Default is a dry-run that only prints the plan.  ``--live`` performs real,
low-frequency calls (E04 adds to cart; the adapter clears the cart first).
No Golden cases are created in the platform by this script.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
for path in (str(BACKEND_ROOT), str(SCRIPTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

from app.agent_test.adapters import AdapterError, run_target  # noqa: E402
from app.agent_test.rules import evaluate_rules  # noqa: E402
from import_shangpin_golden import (  # noqa: E402
    SMOKE_IDS,
    build_checks,
    build_expected,
    load_goldens,
)

DEFAULT_BASE_URL = "https://shang.bettery.cn"


def smoke_config(base_url: str) -> dict[str, Any]:
    phones = [
        item.strip()
        for item in os.getenv("SHANGPIN_CUSTOMER_PHONES", "13900009999,13900009998").split(",")
        if item.strip()
    ]
    return {
        "baseUrl": base_url,
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


def _select(goldens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {str(item.get("id")): item for item in goldens}
    return [by_id[item] for item in SMOKE_IDS if item in by_id]


def _evidence(case: dict[str, Any], trace: dict[str, Any], checks: list[dict[str, Any]]) -> list[str]:
    conversation = trace.get("conversation") or []
    last = conversation[-1] if conversation else {}
    lines = [
        f"answer: {str(last.get('answer') or trace.get('answer') or '')[:160]}",
        f"sources: {last.get('sources') or trace.get('sources') or []}",
        f"cards: {[item.get('name') or item.get('title') for item in (last.get('cards') or []) if isinstance(item, dict)]}",
        f"tokens: {last.get('tokens') or {}}",
        f"cartState: {trace.get('cartState') or trace.get('cart_state') or {}}",
        f"degraded: {last.get('degraded')}",
    ]
    failed = [item for item in checks if not item.get("passed")]
    if failed:
        lines.append("failed: " + "；".join(f"{item['label']}({item['detail']})" for item in failed))
    return lines


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="尚品汇 5 条冒烟（默认 dry-run）")
    parser.add_argument("--live", action="store_true", help="真正调用远程服务")
    parser.add_argument("--base-url", default=os.getenv("SHANGPIN_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--data", default=str(SCRIPTS_DIR / "data" / "shangpin_golden.json"))
    parser.add_argument("--gap-seconds", type=float, default=3.0, help="用例间低频间隔")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    cases = _select(load_goldens(args.data))
    if len(cases) != 5:
        print(f"Golden 数据缺少冒烟用例：需要 {SMOKE_IDS}", file=sys.stderr)
        return 2
    config = smoke_config(args.base_url)
    print(f"Shang Pivot smoke: {len(cases)} cases -> {config['baseUrl']}")
    if not args.live:
        print("[dry-run] 未调用远程服务；使用 --live 执行。")
        for case in cases:
            checks = build_checks(case)
            print(f"- {case['id']}: turns={case['turns']} checks={[item['type'] for item in checks]}")
        return 0

    failed_total = 0
    for index, case in enumerate(cases):
        if index:
            time.sleep(max(0.0, args.gap_seconds))
        print(f"\n=== {case['id']} ===")
        try:
            result = run_target(
                "shangpin",
                config,
                "",
                turns=list(case.get("turns") or []),
            )
        except AdapterError as exc:
            failed_total += 1
            print("FAIL 调用失败：", exc)
            continue
        checks = evaluate_rules(result.trace, build_expected(case), build_checks(case))
        status = "PASS" if checks.get("verdict") == "pass" else "FAIL"
        if status == "FAIL":
            failed_total += 1
        print(f"{status} score={checks.get('score')}")
        for line in _evidence(case, result.trace, checks.get("checks") or []):
            print("  " + line)
    print(f"\n结果：{len(cases) - failed_total}/{len(cases)} 通过")
    return 0 if failed_total == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
