"""Mock CLI Agent: read one JSON request from stdin and print one JSON trace.

Used by the CLI adapter smoke test:
  .venv/Scripts/python scripts/mock_cli_agent.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent_test.adapters import build_mock_trace


def main() -> None:
    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError:
        request = {}
    scenario = str(request.get("scenario") or "success")
    trace = build_mock_trace(
        scenario,
        str(request.get("message") or ""),
        headers={"Authorization": "Bearer cli-secret-token"},
    )
    json.dump(trace, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
