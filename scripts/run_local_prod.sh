#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_UVICORN="$ROOT_DIR/.venv/bin/uvicorn"

if [ ! -x "$VENV_UVICORN" ]; then
  echo "Dependencias locais nao encontradas."
  echo "Execute primeiro: ./scripts/setup_local.sh"
  exit 1
fi

PORT="${PORT:-7860}"

cd "$ROOT_DIR/frontend"
echo "Gerando build do frontend ..."
npm run build

cd "$ROOT_DIR"
echo "Iniciando app completa em http://localhost:${PORT} ..."
exec "$VENV_UVICORN" backend.app.main:app --host 0.0.0.0 --port "$PORT"
