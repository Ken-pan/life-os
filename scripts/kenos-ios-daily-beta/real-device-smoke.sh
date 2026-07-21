#!/usr/bin/env bash
# Real-device smoke for Kenos iOS Daily Beta.
# Requires: unlocked iPhone, Local Network permission granted, Mac Daily Beta LAN up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
BUNDLE="space.kenos.app.ios"
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-http://10.20.202.15:5219}"
EVIDENCE="${1:-$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21}"
mkdir -p "$EVIDENCE/logs" "$EVIDENCE/screenshots"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
ok() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*"; }

RESULTS="$EVIDENCE/ios-daily-beta-results.json"
: >"$EVIDENCE/logs/smoke.txt"

record() {
  echo "$(ts) $*" | tee -a "$EVIDENCE/logs/smoke.txt"
}

# 1) LAN origin health (phone-reachable)
if curl -sf --max-time 3 "$ORIGIN/__health" >/dev/null; then
  record "LAN_ORIGIN PASS $ORIGIN"
  ORIGIN_OK=1
else
  record "LAN_ORIGIN FAIL $ORIGIN"
  ORIGIN_OK=0
fi

# 2) App installed
APPS_JSON="$EVIDENCE/logs/apps.json"
xcrun devicectl device info apps --device "$DEVICE" --json-output "$APPS_JSON" >/dev/null 2>&1 || true
if python3 - <<PY
import json
d=json.load(open("$APPS_JSON"))
apps=d.get("result",{}).get("apps") or d.get("result",{}).get("installedApplications") or []
# recursive search
found=False
def walk(o):
  global found
  if isinstance(o, dict):
    bid=str(o.get("bundleIdentifier") or o.get("urlBundleIdentifier") or "")
    if bid=="$BUNDLE": found=True
    for v in o.values(): walk(v)
  elif isinstance(o, list):
    for v in o: walk(v)
walk(d)
raise SystemExit(0 if found else 1)
PY
then
  record "INSTALL PASS $BUNDLE"
  INSTALL_OK=1
else
  record "INSTALL FAIL $BUNDLE"
  INSTALL_OK=0
fi

# 3) Launch (requires unlock)
LAUNCH_JSON="$EVIDENCE/logs/launch.json"
set +e
xcrun devicectl device process launch --device "$DEVICE" --json-output "$LAUNCH_JSON" "$BUNDLE" >>"$EVIDENCE/logs/smoke.txt" 2>&1
LAUNCH_EC=$?
set -e
if [[ "$LAUNCH_EC" -eq 0 ]]; then
  record "COLD_LAUNCH PASS"
  LAUNCH_OK=1
else
  reason=$(python3 - <<'PY'
import json,sys
try:
  d=json.load(open(sys.argv[1]))
except Exception as e:
  print("parse_error"); raise SystemExit
err=str(d)
if "Locked" in err: print("LOCKED")
elif "not installed" in err.lower(): print("NOT_INSTALLED")
else: print("LAUNCH_ERROR")
PY
"$LAUNCH_JSON" 2>/dev/null || echo LAUNCH_ERROR)
  record "COLD_LAUNCH FAIL reason=$reason ec=$LAUNCH_EC"
  LAUNCH_OK=0
fi

sleep 3
# 4) Access log: any client other than loopback hitting shell after launch
PHONE_HIT=0
if [[ "$LAUNCH_OK" -eq 1 ]]; then
  if rg -N "GET /" "$HOME/Library/Logs/KenosDailyBeta/aios.stderr.log" | tail -40 | rg -v "127\.0\.0\.1" >/tmp/kenos-phone-hits.txt; then
    if [[ -s /tmp/kenos-phone-hits.txt ]]; then
      PHONE_HIT=1
      record "WEB_SHELL_FETCH PASS hits=$(wc -l </tmp/kenos-phone-hits.txt)"
      cp /tmp/kenos-phone-hits.txt "$EVIDENCE/logs/phone-hits.txt"
    fi
  fi
  if [[ "$PHONE_HIT" -eq 0 ]]; then
    record "WEB_SHELL_FETCH UNCONFIRMED (no non-loopback access log yet — check Local Network permission)"
  fi
fi

SHA=$(git -C "$ROOT" rev-parse HEAD)
BUILD=$(cat "$HOME/.kenos-daily-beta/ios-build-number.txt" 2>/dev/null || echo unknown)

python3 - <<PY
import json
from pathlib import Path
out={
  "generatedAt": "$(ts)",
  "gitSha": "$SHA",
  "appVersion": "1.0.0",
  "appBuild": "$BUILD",
  "bundleId": "$BUNDLE",
  "device": {
    "name": "Ken's 17 Pro",
    "model": "iPhone 17 Pro (iPhone18,1)",
    "os": "27.0",
    "udid": "00008150-000C38C20AC0401C",
    "coredeviceId": "$DEVICE"
  },
  "origin": "$ORIGIN",
  "checks": {
    "LAN_ORIGIN": bool($ORIGIN_OK),
    "REAL_DEVICE_INSTALL": bool($INSTALL_OK),
    "COLD_LAUNCH": bool($LAUNCH_OK),
    "WEB_SHELL_FETCH": bool($PHONE_HIT)
  },
  "launchExitCode": $LAUNCH_EC,
  "notes": "Planner/Fitness Continuity, account isolation, lifecycle, dark mode, VoiceOver require unlocked interactive smoke."
}
Path("$RESULTS").write_text(json.dumps(out, indent=2)+"\n")
print(json.dumps(out, indent=2))
PY

if [[ "$LAUNCH_OK" -ne 1 ]]; then
  exit 2
fi
exit 0
