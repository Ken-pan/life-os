#!/usr/bin/env bash
# Wait until 17 Pro is USB-visible to libimobiledevice AND unlocked, then screenshot native shell.
# Wi-Fi CoreDevice alone cannot drive idevicescreenshot.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
UDID="${KENOS_IOS_UDID:-00008150-000C38C20AC0401C}"
BUNDLE="${KENOS_IOS_BUNDLE:-space.kenos.app.ios}"
MAX_MIN="${1:-60}"
EVID="$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21"
LOG="$EVID/logs/wait-usb-native-shot.txt"
PIDFILE="/tmp/kenos-wait-usb-shot.pid"
SHOT="$EVID/screenshots/ia-web-parity/04-ios-native-shell.png"
mkdir -p "$EVID/logs" "$(dirname "$SHOT")"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

echo $$ >"$PIDFILE"
echo "$(ts) wait-usb-shot start max_min=$MAX_MIN udid=$UDID pid=$$" | tee "$LOG"

end=$(( $(date +%s) + MAX_MIN * 60 ))
poll=0
while (( $(date +%s) < end )); do
  poll=$((poll + 1))
  LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  USB=0
  if idevice_id -l 2>/dev/null | grep -qx "$UDID"; then USB=1; fi
  echo "$(ts) poll=$poll usb=$USB lan=${LAN:-none}" | tee -a "$LOG"

  if [[ "$USB" -ne 1 ]]; then
    sleep 10
    continue
  fi

  set +e
  OUT="$(xcrun devicectl device process launch --terminate-existing --device "$DEVICE" \
    ${LAN:+--payload-url "http://${LAN}:5219/?iosNativeShell=1"} \
    "$BUNDLE" 2>&1)"
  EC=$?
  set -e
  echo "$OUT" >>"$LOG"

  if [[ $EC -ne 0 ]] || echo "$OUT" | grep -q Locked; then
    echo "$(ts) usb present but locked/failed ec=$EC" | tee -a "$LOG"
    sleep 8
    continue
  fi

  echo "$(ts) UNLOCKED+USB — screenshot" | tee -a "$LOG"
  sleep 2
  set +e
  idevicescreenshot -u "$UDID" "$SHOT" >>"$LOG" 2>&1
  SHOT_EC=$?
  set -e

  if [[ $SHOT_EC -eq 0 && -f "$SHOT" ]]; then
    python3 - <<PY
import json
from datetime import datetime, timezone
from pathlib import Path
p = Path("$EVID/logs/ia-native-toolbar-status.json")
p.write_text(json.dumps({
  "ts": datetime.now(timezone.utc).isoformat(),
  "device": "$DEVICE",
  "status": "PASS_LAUNCH_SCREENSHOT",
  "screenshot": "docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/ia-web-parity/04-ios-native-shell.png",
  "a11y_ids_in_source": True,
  "note": "USB + unlock: idevicescreenshot captured native shell.",
  "dailyBetaOrigin": "http://${LAN}:5219" if "$LAN" else None,
}, indent=2) + "\n")
t = Path("$EVID/IA_WEB_PARITY.md").read_text()
old = "| iOS native Continue / Quick Switch toolbar | **PASS_LAUNCH_NO_USB_SHOT** | Unlock launch @ 06:20:41Z · a11y ids in KenosRootView · PNG needs USB |"
new = "| iOS native Continue / Quick Switch toolbar | **PASS_LAUNCH_SCREENSHOT** | \`04-ios-native-shell.png\` · a11y ids in KenosRootView |"
if old in t:
    Path("$EVID/IA_WEB_PARITY.md").write_text(t.replace(old, new))
print("PASS_LAUNCH_SCREENSHOT")
PY
    rm -f "$PIDFILE"
    echo "$(ts) DONE shot_ok" | tee -a "$LOG"
    exit 0
  fi

  echo "$(ts) screenshot failed ec=$SHOT_EC" | tee -a "$LOG"
  sleep 8
done

echo "$(ts) TIMEOUT — USB+unlock window not captured" | tee -a "$LOG"
rm -f "$PIDFILE"
exit 1
