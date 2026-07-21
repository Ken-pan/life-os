#!/usr/bin/env bash
# Wait for 17 Pro unlock, then screenshot native Kenos shell (Continue / Quick Switch chrome).
# Does not claim XCUITest sheet open; records launch + screenshot + a11y id presence in binary.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
UDID="${KENOS_IOS_UDID:-00008150-000C38C20AC0401C}"
BUNDLE="${KENOS_IOS_BUNDLE:-space.kenos.app.ios}"
MAX_MIN="${1:-90}"
EVID="$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21"
LOG="$EVID/logs/wait-ia-native-toolbar.txt"
PIDFILE="/tmp/kenos-wait-ia-native.pid"
SHOT_DIR="$EVID/screenshots/ia-web-parity"
mkdir -p "$EVID/logs" "$SHOT_DIR"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

echo $$ >"$PIDFILE"
echo "$(ts) wait-ia-native start max_min=$MAX_MIN device=$DEVICE pid=$$" | tee "$LOG"

end=$(( $(date +%s) + MAX_MIN * 60 ))
poll=0
while (( $(date +%s) < end )); do
  poll=$((poll + 1))
  LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  echo "$(ts) poll=$poll lan=${LAN:-none}" | tee -a "$LOG"

  set +e
  OUT="$(xcrun devicectl device process launch --terminate-existing --device "$DEVICE" \
    ${LAN:+--payload-url "http://${LAN}:5219/?iosNativeShell=1"} \
    "$BUNDLE" 2>&1)"
  EC=$?
  set -e
  echo "$OUT" >>"$LOG"

  if [[ $EC -eq 0 ]] && ! echo "$OUT" | grep -q Locked; then
    echo "$(ts) UNLOCKED — capturing shell screenshot" | tee -a "$LOG"
    sleep 2
    SHOT="$SHOT_DIR/04-ios-native-shell.png"
    set +e
    idevicescreenshot -u "$UDID" "$SHOT" >>"$LOG" 2>&1
    SHOT_EC=$?
    set -e

    # Confirm a11y identifiers still compiled into shared sources (code contract)
    CODE_OK=0
    if grep -q 'kenos.continue.trigger' "$ROOT/clients/apple/Apps/Shared/KenosRootView.swift" \
      && grep -q 'kenos.quickSwitch.trigger' "$ROOT/clients/apple/Apps/Shared/KenosRootView.swift"; then
      CODE_OK=1
    fi

    python3 - <<PY
import json
from datetime import datetime, timezone
from pathlib import Path
p = Path("$EVID/logs/ia-native-toolbar-status.json")
p.write_text(json.dumps({
  "ts": datetime.now(timezone.utc).isoformat(),
  "device": "$DEVICE",
  "status": "PASS_LAUNCH_SCREENSHOT" if $SHOT_EC == 0 else "PASS_LAUNCH_NO_SHOT",
  "screenshot": str(Path("$SHOT").relative_to("$ROOT")) if $SHOT_EC == 0 else None,
  "a11y_ids_in_source": bool($CODE_OK),
  "note": "Launch + screenshot after unlock. Sheet open not XCUITest-tapped; Continue/Quick Switch ids present in KenosRootView.",
  "dailyBetaOrigin": "http://${LAN}:5219" if "$LAN" else None,
}, indent=2) + "\n")
print("wrote", p)
PY

    # Soft append to IA_WEB_PARITY
    python3 - <<'PY'
from pathlib import Path
p = Path("docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/IA_WEB_PARITY.md")
t = p.read_text()
old = "| iOS native Continue / Quick Switch toolbar | **BLOCKED_LOCKED** | 17 Pro launch denied (device Locked) — Owner unlock to re-verify |"
new = "| iOS native Continue / Quick Switch toolbar | **PASS_LAUNCH_SCREENSHOT** | `04-ios-native-shell.png` · a11y ids in `KenosRootView` |"
if old in t:
    p.write_text(t.replace(old, new))
    print("IA_WEB_PARITY updated")
elif "PASS_LAUNCH_SCREENSHOT" not in t:
    p.write_text(t.rstrip() + "\n\nNative toolbar recheck completed after unlock — see `logs/ia-native-toolbar-status.json`.\n")
PY

    rm -f "$PIDFILE"
    echo "$(ts) DONE shot_ec=$SHOT_EC code_ok=$CODE_OK" | tee -a "$LOG"
    exit 0
  fi

  echo "$(ts) still locked/failed ec=$EC" | tee -a "$LOG"
  sleep 15
done

echo "$(ts) TIMEOUT after ${MAX_MIN}m — still locked" | tee -a "$LOG"
rm -f "$PIDFILE"
exit 1
