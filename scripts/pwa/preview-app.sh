#!/usr/bin/env bash
# Start preview for a Life OS app (standard PWA debug port from apps.config).
# Usage: ./scripts/pwa/preview-app.sh planner
#        PWA_APP=planner ./scripts/pwa/preview-app.sh
#        PWA_BUILD=1 ./scripts/pwa/preview-app.sh planner   # force rebuild first
set -euo pipefail

APP="${PWA_APP:-${1:-fitness}}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

case "$APP" in
  planner) WORKSPACE="planner-os"; PORT=5188; BUILD_DIR="apps/planner/build" ;;
  fitness) WORKSPACE="fitness-os"; PORT=4173; BUILD_DIR="apps/fitness/build" ;;
  music)   WORKSPACE="music-os";   PORT=5191; BUILD_DIR="apps/music/build" ;;
  finance) WORKSPACE="finance-os"; PORT=5180; BUILD_DIR="apps/finance/build" ;;
  portal) WORKSPACE="portal"; PORT=5195; BUILD_DIR="apps/portal/build"; BUILD_MARKER="apps/portal/build/manifest.webmanifest" ;;
  home)    WORKSPACE="home-os";    PORT=5196; BUILD_DIR="apps/home/build" ;;
  starter) WORKSPACE="starter-os"; PORT=5875; BUILD_DIR="apps/starter/build" ;;
  *)
    echo "Unknown app: $APP (planner|fitness|music|finance|portal|home|starter)"
    exit 1
    ;;
esac

PORT="${PORT:-${PWA_PORT:-$PORT}}"
HOST="${HOST:-0.0.0.0}"
BUILD_INDEX="$ROOT/$BUILD_DIR/index.html"
BUILD_MARKER="${BUILD_MARKER:-$BUILD_INDEX}"

if [[ "${PWA_BUILD:-0}" == "1" ]] || [[ ! -f "$BUILD_MARKER" ]]; then
  echo "Building ${WORKSPACE}…"
  npm run build -w "$WORKSPACE"
fi

if [[ ! -f "$BUILD_MARKER" ]]; then
  echo "Missing production build marker: $BUILD_MARKER"
  exit 1
fi

echo "Preview ${APP} (${WORKSPACE}) → http://${HOST}:${PORT}"
cd "$ROOT"
export CI=1
exec npm run preview -w "$WORKSPACE" -- --host "$HOST" --port "$PORT" --strictPort
