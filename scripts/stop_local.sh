#!/usr/bin/env bash
# Stop locally deployed app processes. Infrastructure is left running unless --all.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/.local"
for name in frontend backend mock-agent shang-backend minio; do
  pidfile="$LOCAL/run/$name.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile" 2>/dev/null || true)
    if [ -n "$pid" ] && kill "$pid" >/dev/null 2>&1; then
      echo "stopped $name ($pid)"
    else
      echo "skip $name (process not running)"
    fi
    rm -f "$pidfile"
  fi
done
if [ "${1:-}" = "--all" ]; then
  if [ -x /d/environment/postgresql/bin/pg_ctl ]; then
    /d/environment/postgresql/bin/pg_ctl -D "$LOCAL/pgdata" stop -m fast >/dev/null 2>&1 || true
    echo "stopped postgres"
  fi
fi
