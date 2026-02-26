#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_UVICORN="$ROOT_DIR/.venv/bin/uvicorn"

if [ ! -x "$VENV_UVICORN" ]; then
  echo "Dependencias locais nao encontradas."
  echo "Execute primeiro: ./scripts/setup_local.sh"
  exit 1
fi

cleanup() {
  local pids
  pids="$(jobs -p || true)"
  if [ -n "${pids}" ]; then
    kill ${pids} >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

echo "Iniciando backend FastAPI em http://localhost:8000 ..."
"$VENV_UVICORN" backend.app.main:app --reload --host 0.0.0.0 --port 8000 &

echo "Iniciando frontend React em http://localhost:5173 ..."
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
