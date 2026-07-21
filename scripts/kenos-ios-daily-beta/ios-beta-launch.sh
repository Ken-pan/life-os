#!/usr/bin/env bash
# Launch Kenos iOS Daily Beta on paired device with optional payload URL.
# Usage:
#   ./scripts/kenos-ios-daily-beta/ios-beta-launch.sh
#   ./scripts/kenos-ios-daily-beta/ios-beta-launch.sh /settings
#   KENOS_PAYLOAD_URL=http://10.x.x.x:5219/spaces ./scripts/kenos-ios-daily-beta/ios-beta-launch.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
BUNDLE="${KENOS_IOS_BUNDLE:-space.kenos.app.ios}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-http://${LAN_IP}:5219}"
PATH_ARG="${1:-/}"
PAYLOAD="${KENOS_PAYLOAD_URL:-}"

case "$ORIGIN" in
  *127.0.0.1*|*localhost*)
    echo "ERROR: refuse loopback origin for phone: $ORIGIN" >&2
    exit 1
    ;;
esac

if [[ -z "$PAYLOAD" ]]; then
  if [[ "$PATH_ARG" == http* ]]; then
    PAYLOAD="$PATH_ARG"
  else
    [[ "$PATH_ARG" == /* ]] || PATH_ARG="/$PATH_ARG"
    if [[ "$PATH_ARG" == *\?* ]]; then
      PAYLOAD="${ORIGIN}${PATH_ARG}&iosNativeShell=1"
    else
      PAYLOAD="${ORIGIN}${PATH_ARG}?iosNativeShell=1"
    fi
  fi
fi

echo "==> launch $BUNDLE"
echo "    device=$DEVICE"
echo "    payload=$PAYLOAD"

set +e
xcrun devicectl device process launch \
  --device "$DEVICE" \
  --terminate-existing \
  --payload-url "$PAYLOAD" \
  "$BUNDLE"
EC=$?
set -e
if [[ "$EC" -ne 0 ]]; then
  echo "ERROR: launch failed ec=$EC (unlock phone if Locked)" >&2
  exit "$EC"
fi
echo "LAUNCH_OK"
