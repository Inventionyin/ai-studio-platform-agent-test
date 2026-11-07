#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "backend/.venv 不存在，请先执行: uv venv .venv --python 3.12 && uv pip install -r requirements.txt" >&2
  exit 1
fi

.venv/bin/alembic upgrade head
exec .venv/bin/python -m uvicorn app.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}"
