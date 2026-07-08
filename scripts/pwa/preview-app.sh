#!/usr/bin/env bash
# Start preview for a Life OS app (standard PWA debug port from apps.config).
# Usage: ./scripts/pwa/preview-app.sh fitness
#        PWA_APP=planner ./scripts/pwa/preview-app.sh
set -euo pipefail

APP="${PWA_APP:-${1:-fitness}}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

case "$APP" in
  planner) WORKSPACE="planner-os"; PORT=5188 ;;
  fitness) WORKSPACE="fitness-os"; PORT=4173 ;;
  music)   WORKSPACE="music-os";   PORT=5191 ;;
  finance) WORKSPACE="finance-os"; PORT=5180 ;;
  portal)  WORKSPACE="portal";     PORT=5195 ;;
  *)
    echo "Unknown app: $APP (planner|fitness|music|finance|portal)"
    exit 1
    ;;
esac

PORT="${PORT:-${PWA_PORT:-$PORT}}"
HOST="${HOST:-0.0.0.0}"

echo "Preview ${APP} (${WORKSPACE}) → http://${HOST}:${PORT}"
cd "$ROOT"
exec npm run preview -w "$WORKSPACE" -- --host "$HOST" --port "$PORT"
