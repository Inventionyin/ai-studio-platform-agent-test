"""Capture Shang Pivot AI chat UI evidence with Playwright.

Usage:
  .venv/Scripts/python scripts/shangpin_ui_smoke.py --live
  .venv/Scripts/python scripts/shangpin_ui_smoke.py --live --base-url https://shang.bettery.cn \
      --message "推荐一个手机，预算两千左右"

Outputs screenshots, video and manifest.json under docs/evidence/shangpin-ui/<timestamp>/.
This is a Phase 3 evidence helper; it does not modify Shang Pivot.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path

import httpx


def login(base_url: str, phone: str, code: str) -> dict:
    client = httpx.Client(timeout=60)
    response = client.post(
        f"{base_url.rstrip('/')}/api/auth/login",
        json={"phone": phone, "code": code, "clientType": "h5"},
    )
    payload = response.json()
    if response.status_code >= 400 or payload.get("code") not in (0, "0"):
        raise RuntimeError(f"登录失败：{response.status_code} {payload}")
    return payload["data"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="尚品汇 AI 对话 UI 截图/录屏")
    parser.add_argument("--live", action="store_true", help="真正打开浏览器并发送消息")
    parser.add_argument("--base-url", default=os.getenv("SHANGPIN_BASE_URL", "https://shang.bettery.cn"))
    parser.add_argument("--phone", default=os.getenv("SHANGPIN_CUSTOMER_PHONE", "13900009999"))
    parser.add_argument("--code", default=os.getenv("SHANGPIN_SMS_CODE", "123456"))
    parser.add_argument("--message", default="推荐一个手机，预算两千左右")
    parser.add_argument("--output-root", default=str(Path(__file__).resolve().parents[2] / "docs" / "evidence" / "shangpin-ui"))
    parser.add_argument("--headed", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output = Path(args.output_root) / stamp
    output.mkdir(parents=True, exist_ok=True)
    if not args.live:
        print(f"[dry-run] 将打开 {args.base_url}/ai，发送：{args.message}")
        print(f"输出目录：{output}")
        return 0

    from playwright.sync_api import sync_playwright

    auth = login(args.base_url, args.phone, args.code)
    manifest: dict = {
        "baseUrl": args.base_url,
        "phone": args.phone,
        "message": args.message,
        "startedAt": datetime.now().isoformat(),
        "screenshots": [],
        "video": None,
        "answer": "",
        "consoleErrors": [],
    }

    with sync_playwright() as p:
        try:
            # Prefer installed Chrome; avoids the large bundled Chromium download.
            browser = p.chromium.launch(channel="chrome", headless=not args.headed)
        except Exception:
            browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=str(output),
            record_video_size={"width": 1440, "height": 900},
        )
        page = context.new_page()
        page.on("console", lambda msg: manifest["consoleErrors"].append(msg.text) if msg.type == "error" else None)
        page.goto(args.base_url.rstrip("/") + "/", wait_until="domcontentloaded", timeout=60_000)
        page.evaluate(
            """([access, refresh]) => {
                localStorage.setItem('shang_mall_access', access);
                if (refresh) localStorage.setItem('shang_mall_refresh', refresh);
            }""",
            [auth["accessToken"], auth.get("refreshToken") or ""],
        )
        try:
            page.goto(args.base_url.rstrip("/") + "/ai", wait_until="domcontentloaded", timeout=60_000)
        except Exception:
            # Some dev-server routes finish client-side navigation after aborting
            # the document request; the page is still usable.
            page.wait_for_timeout(2000)
        page.wait_for_timeout(2500)
        page.screenshot(path=str(output / "01-chat-open.png"), full_page=True)
        manifest["screenshots"].append(str(output / "01-chat-open.png"))

        composer = page.get_by_placeholder("想买什么？描述需求，我来帮你挑~")
        composer.wait_for(state="visible", timeout=20_000)
        composer.fill(args.message)
        page.get_by_role("button", name="发送").click()
        page.wait_for_timeout(12_000)
        page.screenshot(path=str(output / "02-answer.png"), full_page=True)
        manifest["screenshots"].append(str(output / "02-answer.png"))

        # Best-effort answer extraction from the last assistant bubble.
        try:
            bubbles = page.locator(".bubble").all_inner_texts()
            manifest["answer"] = bubbles[-1] if bubbles else ""
        except Exception:
            manifest["answer"] = ""

        page.wait_for_timeout(1000)
        video = page.video
        context.close()
        if video:
            manifest["video"] = str(video.path())
        browser.close()

    manifest["finishedAt"] = datetime.now().isoformat()
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "manifest": str(output / "manifest.json"), "answer": manifest["answer"][:300]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
