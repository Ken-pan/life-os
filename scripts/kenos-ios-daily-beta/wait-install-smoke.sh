#!/usr/bin/env bash
# Wait for a pairable Kenos iPhone, install prebuilt (or rebuild) Daily Beta app, smoke /settings deep link.
# Usage: ./scripts/kenos-ios-daily-beta/wait-install-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DEFAULT="$ROOT/clients/apple/Apps/build-device/Build/Products/Debug-iphoneos/KenosIOS.app"
APP="${KENOS_IOS_APP:-$APP_DEFAULT}"
EVIDENCE="${KENOS_IOS_EVIDENCE:-$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21}"
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-http://$(ipconfig getifaddr en0 2>/dev/null || echo 10.20.202.15):5219}"
BUNDLE="space.kenos.app.ios"
LOG="$EVIDENCE/logs/wait-install-smoke.log"
mkdir -p "$EVIDENCE/logs"

DEVICE_17="8097F071-CAB6-5AF0-8258-BCD985E9D79E"
DEVICE_15="DB1122B8-C6A8-5DB2-958B-637D01E25BF5"
UDID_17="00008150-000C38C20AC0401C"
UDID_15="00008130-0008045E0843401C"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

profile_has() {
  local udid="$1"
  local profdir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
  local f
  for f in "$profdir"/*.mobileprovision; do
    [ -f "$f" ] || continue
    if security cms -D -i "$f" 2>/dev/null | plutil -extract ProvisionedDevices json -o - - 2>/dev/null | grep -q "$udid"; then
      return 0
    fi
  done
  return 1
}

device_line() {
  local id="$1"
  xcrun devicectl list devices 2>/dev/null | grep "$id" || true
}

device_online() {
  local id="$1"
  local line
  line="$(device_line "$id")"
  echo "$line" | grep -Eq "available \(paired\)|connected"
}

pick_target() {
  if device_online "$DEVICE_17" && { profile_has "$UDID_17" || [[ -d "$APP" ]]; }; then
    echo "$DEVICE_17|17pro"
    return 0
  fi
  if device_online "$DEVICE_15" && profile_has "$UDID_15"; then
    echo "$DEVICE_15|15pro"
    return 0
  fi
  return 1
}

log "WAIT start origin=$ORIGIN app=$APP"

MAX_ROUNDS="${KENOS_WAIT_ROUNDS:-60}" # ~10 min at 10s
for ((i=1; i<=MAX_ROUNDS; i++)); do
  if target="$(pick_target)"; then
    DEVICE="${target%%|*}"
    LABEL="${target##*|}"
    log "TARGET $LABEL device=$DEVICE"
    break
  fi
  if (( i % 6 == 0 )); then
    log "still waiting ($i/$MAX_ROUNDS) 17=$(device_line "$DEVICE_17" | awk '{print $NF}') 15_profile=$(profile_has "$UDID_15" && echo yes || echo no)"
  fi
  sleep 10
  DEVICE=""
done

if [[ -z "${DEVICE:-}" ]]; then
  log "TIMEOUT no installable online device"
  exit 2
fi

if [[ ! -d "$APP" ]]; then
  log "MISSING app — running device-build-install.sh"
  export KENOS_IOS_DEVICE="$DEVICE"
  export KENOS_DAILY_BETA_ORIGIN="$ORIGIN"
  "$ROOT/scripts/kenos-ios-daily-beta/device-build-install.sh" | tee -a "$LOG"
else
  log "INSTALL $APP → $DEVICE"
  xcrun devicectl device install app --device "$DEVICE" "$APP" 2>&1 | tee -a "$LOG"
fi

log "LAUNCH settings deep link"
MARK=$(wc -l <"$HOME/Library/Logs/KenosDailyBeta/aios.stderr.log" 2>/dev/null || echo 0)
xcrun devicectl device process launch \
  --device "$DEVICE" \
  --terminate-existing \
  --payload-url "${ORIGIN}/settings?iosNativeShell=1" \
  "$BUNDLE" 2>&1 | tee -a "$LOG"
sleep 5

python3 - <<PY
from pathlib import Path
import json
logp = Path.home() / "Library/Logs/KenosDailyBeta/aios.stderr.log"
mark = int("$MARK")
lines = logp.read_text(errors="ignore").splitlines()[mark:] if logp.exists() else []
phone = [l for l in lines if "10.20.202." in l and "127.0.0.1" not in l]
settings = [l for l in phone if "/settings" in l]
(Path("$EVIDENCE") / "logs" / "wait-settings-traffic.txt").write_text("\n".join(phone[-40:]) + ("\n" if phone else ""))
summary = {
  "generatedAt": "$(ts)",
  "device": "$DEVICE",
  "label": "$LABEL",
  "origin": "$ORIGIN",
  "phoneHits": len(phone),
  "settingsHits": len(settings),
  "settingsPass": len(settings) > 0,
  "sample": phone[-8:],
}
Path("$EVIDENCE/logs/wait-install-smoke-summary.json").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
raise SystemExit(0 if summary["settingsPass"] else 1)
PY
