#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt

cd frontend
npm install

echo
echo "Setup concluido."
echo "Use:"
echo "  ./scripts/run_local_dev.sh"
echo "ou"
echo "  ./scripts/run_local_prod.sh"
