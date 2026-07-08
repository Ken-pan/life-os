#!/usr/bin/env bash
# Open Life OS app in iOS Simulator Safari.
# Usage: PWA_APP=fitness ./scripts/pwa/ios-sim-open.sh /discover
#        ./scripts/pwa/ios-sim-open.sh fitness /program
set -euo pipefail

DEVICE="${DEVICE:-iPhone 17 Pro}"
HOST="${HOST:-localhost}"

# Args: [app] [path]  or  [path] with PWA_APP env
if [[ "${1:-}" =~ ^(planner|fitness|music|finance|portal)$ ]]; then
  APP="$1"
  PATHNAME="${2:-/}"
else
  APP="${PWA_APP:-fitness}"
  PATHNAME="${1:-/}"
fi

case "$APP" in
  planner) PORT="${PORT:-5188}" ;;
  fitness) PORT="${PORT:-4173}" ;;
  music)   PORT="${PORT:-5191}" ;;
  finance) PORT="${PORT:-5180}" ;;
  portal)  PORT="${PORT:-5195}" ;;
  *)
    echo "Unknown PWA_APP: $APP"
    exit 1
    ;;
esac

echo "App: ${APP}  Port: ${PORT}  Path: ${PATHNAME}"
xcode-select -p >/dev/null
open -a Simulator
xcrun simctl boot "${DEVICE}" 2>/dev/null || true

URL="http://${HOST}:${PORT}${PATHNAME}"
echo "Opening: ${URL}"
xcrun simctl openurl booted "${URL}"

echo ""
echo "Standalone PWA: Safari → Share → Add to Home Screen → open from Home Screen."
echo "Screenshot: PWA_APP=${APP} npm run pwa:sim:shot -- ${APP}-${PATHNAME//\//-}"
echo "Metrics:    npm run pwa:metrics"
