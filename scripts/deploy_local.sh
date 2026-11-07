#!/usr/bin/env bash
# Local deployment for the AI test platform.
# Starts PostgreSQL, MinIO, RabbitMQ (if installed), backend, mock agent and frontend.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$ROOT/.local"
PG_BIN="${PG_BIN:-/d/environment/postgresql/bin}"
PG_DATA="$LOCAL/pgdata"
PG_PORT="${PG_PORT:-55432}"
MINIO="$LOCAL/minio/minio.exe"
FRONTEND_PORT="${FRONTEND_PORT:-8443}"
mkdir -p "$LOCAL/run" "$LOCAL/logs" "$LOCAL/pglog" "$LOCAL/minio/data"

ok() { printf '  [OK] %s\n' "$1"; }
info() { printf '\n== %s ==\n' "$1"; }
need() { command -v "$1" >/dev/null 2>&1; }

info "PostgreSQL"
if "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
  ok "already running on $PG_PORT"
else
  "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$LOCAL/pglog/postgres.log" -o "-p $PG_PORT -h 127.0.0.1" start >/dev/null
  ok "started on $PG_PORT"
fi

info "MinIO"
if curl -fsS --max-time 2 "http://127.0.0.1:9000/minio/health/live" >/dev/null 2>&1; then
  ok "already running on 9000"
elif [ -x "$MINIO" ]; then
  (cd "$LOCAL/minio" && MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}" \
    MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}" \
    nohup ./minio.exe server ./data --address 127.0.0.1:9000 --console-address 127.0.0.1:9001 \
    > "$LOCAL/logs/minio.log" 2>&1 & echo $! > "$LOCAL/run/minio.pid")
  ok "started on 9000"
else
  echo "  [SKIP] MinIO binary not found: $MINIO" >&2
fi

info "RabbitMQ"
if (netstat -ano 2>/dev/null | grep -q ':5672 .*LISTENING'); then
  ok "already running on 5672"
elif need sc; then
  sc start RabbitMQ >/dev/null 2>&1 || true
  sleep 2
  ok "start requested (service RabbitMQ)"
else
  echo "  [SKIP] RabbitMQ service not installed" >&2
fi

info "Backend"
if curl -fsS --max-time 2 http://127.0.0.1:8000/healthz >/dev/null 2>&1; then
  ok "already running on 8000"
else
  cd "$ROOT/backend"
  .venv/Scripts/python -m alembic upgrade head >/dev/null
  nohup .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
    > "$LOCAL/logs/backend.log" 2>&1 & echo $! > "$LOCAL/run/backend.pid"
  ok "started on 8000"
fi

info "Mock Agent"
if curl -fsS --max-time 2 http://127.0.0.1:8088/health >/dev/null 2>&1; then
  ok "already running on 8088"
else
  cd "$ROOT/backend"
  nohup .venv/Scripts/python -m scripts.mock_agent_service > "$LOCAL/logs/mock-agent.log" 2>&1 & echo $! > "$LOCAL/run/mock-agent.pid"
  ok "started on 8088"
fi

info "Frontend"
if curl -fsS --max-time 2 "http://127.0.0.1:$FRONTEND_PORT/" >/dev/null 2>&1; then
  ok "already running on $FRONTEND_PORT"
else
  cd "$ROOT"
  pnpm build >/dev/null
  nohup pnpm preview --host 127.0.0.1 --port "$FRONTEND_PORT" > "$LOCAL/logs/frontend.log" 2>&1 & echo $! > "$LOCAL/run/frontend.pid"
  ok "started on $FRONTEND_PORT"
fi

info "Shang Pivot graph (optional)"
if [ -n "${SHANGPIVOT_HOME:-}" ] && [ -f "$SHANGPIVOT_HOME/backend/shang-server/target/shang-server-0.0.1-SNAPSHOT.jar" ]; then
  if curl -fsS --max-time 2 http://127.0.0.1:8086/api/home >/dev/null 2>&1; then
    ok "already running on 8086"
  else
    (cd "$SHANGPIVOT_HOME/backend" && nohup java -jar shang-server/target/shang-server-0.0.1-SNAPSHOT.jar \
      > "$LOCAL/logs/shang-backend.log" 2>&1 & echo $! > "$LOCAL/run/shang-backend.pid")
    ok "started on 8086"
  fi
else
  echo "  [SKIP] set SHANGPIVOT_HOME to the Shang Pivot project root to start graph backend" >&2
fi

sleep 2
info "Health"
for item in "platform http://127.0.0.1:8000/healthz" "frontend http://127.0.0.1:$FRONTEND_PORT/" "minio http://127.0.0.1:9000/minio/health/live" "mock http://127.0.0.1:8088/health"; do
  name=${item%% *}; url=${item#* }
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || true)
  printf '  %-10s %s\n' "$name" "${code:-down}"
done
