#!/usr/bin/env bash
# Starts the API and the web app together, and stops both on Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is not installed. Install it with:" >&2
  echo "  curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

# uv sync is quick when nothing has changed, so it is safe to run every time.
# It also installs the right Python if the pinned version is missing.
(cd backend && uv sync --quiet)

if [ ! -d frontend/node_modules ]; then
  echo "Installing web dependencies..."
  (cd frontend && npm install)
fi

trap 'kill 0' EXIT INT TERM

(cd backend && uv run uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev) &

echo
echo "  API  http://localhost:8000/docs"
echo "  App  http://localhost:5173"
echo
wait
