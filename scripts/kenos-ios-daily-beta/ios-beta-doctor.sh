#!/usr/bin/env bash
# Kenos iOS Daily Beta doctor — device / signing / LAN / install readiness.
# Usage: ./scripts/kenos-ios-daily-beta/ios-beta-doctor.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
BUNDLE="${KENOS_IOS_BUNDLE:-space.kenos.app.ios}"
TEAM="${KENOS_IOS_TEAM:-93NJ4CAU8B}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
LOCAL_HOST="$(scutil --get LocalHostName 2>/dev/null || true)"
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-}"
if [[ -z "$ORIGIN" ]]; then
  if [[ -f "$HOME/.kenos-daily-beta/lan-origin.txt" ]]; then
    ORIGIN="$(tr -d '[:space:]' <"$HOME/.kenos-daily-beta/lan-origin.txt")"
  elif [[ -n "$LOCAL_HOST" ]]; then
    ORIGIN="http://${LOCAL_HOST}.local:5219"
  elif [[ -n "$LAN_IP" ]]; then
    ORIGIN="http://${LAN_IP}:5219"
  fi
fi
APP="${KENOS_IOS_APP:-$ROOT/clients/apple/Apps/build-device/Build/Products/Debug-iphoneos/KenosIOS.app}"
EVIDENCE="${1:-$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21}"
mkdir -p "$EVIDENCE/logs"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
ok() { echo "[PASS] $*"; }
warn() { echo "[WARN] $*"; }
fail() { echo "[FAIL] $*"; }

echo "==> Kenos iOS Daily Beta doctor $(ts)"
echo "device=$DEVICE team=$TEAM origin=$ORIGIN"
echo "local_hostname=${LOCAL_HOST:-none}"
HOST_PART="${ORIGIN#http://}"; HOST_PART="${HOST_PART#https://}"; HOST_PART="${HOST_PART%%/*}"; HOST_PART="${HOST_PART%%:*}"
if [[ "$HOST_PART" == *.local ]]; then
  ok "origin uses stable mDNS hostname ($HOST_PART)"
elif [[ "$HOST_PART" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  warn "origin still DHCP IPv4 ($HOST_PART) — rebuild with LocalHostName.local"
else
  warn "origin host=$HOST_PART"
fi

# Devices
DEV_LINE="$(xcrun devicectl list devices 2>/dev/null | grep "$DEVICE" || true)"
echo "device_line=$DEV_LINE"
if echo "$DEV_LINE" | grep -Eq "available \(paired\)|connected"; then
  ok "device online"
  DEVICE_OK=1
else
  fail "device offline/unavailable"
  DEVICE_OK=0
fi

# LAN
if [[ -n "$ORIGIN" ]] && curl -sf --max-time 3 "${ORIGIN}/__health" >/dev/null 2>&1; then
  ok "LAN origin health $ORIGIN"
  ORIGIN_OK=1
else
  fail "LAN origin unreachable (refused 127.0.0.1 for phone)"
  ORIGIN_OK=0
fi
for port in 5188 5190; do
  if [[ -n "$LAN_IP" ]] && curl -sf --max-time 3 "http://${LAN_IP}:${port}/" >/dev/null 2>&1; then
    ok "domain :$port"
  else
    warn "domain :$port down"
  fi
done

# App on device
APPS_JSON="$EVIDENCE/logs/doctor-apps.json"
set +e
xcrun devicectl device info apps --device "$DEVICE" --json-output "$APPS_JSON" >/dev/null 2>&1
set -e
INSTALLED=0
if [[ -f "$APPS_JSON" ]]; then
  if python3 - <<PY
import json
d=json.load(open("$APPS_JSON"))
found=False
def walk(o):
  global found
  if isinstance(o, dict):
    if str(o.get("bundleIdentifier") or "")=="$BUNDLE":
      found=True
      print(o.get("version"), o.get("bundleVersion"), o.get("name"))
    for v in o.values(): walk(v)
  elif isinstance(o, list):
    for v in o: walk(v)
walk(d)
raise SystemExit(0 if found else 1)
PY
  then
    ok "app installed $BUNDLE"
    INSTALLED=1
  else
    fail "app not installed"
  fi
fi

# Local signed product
if [[ -d "$APP" ]]; then
  ok "local .app present"
  security cms -D -i "$APP/embedded.mobileprovision" 2>/dev/null \
    | plutil -extract TeamIdentifier json -o - - 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :KENOS_DAILY_BETA_ORIGIN' "$APP/Info.plist" 2>/dev/null || true
else
  warn "local .app missing — run device-build-install.sh"
fi

# Launch probe (detect Locked)
if [[ "$DEVICE_OK" -eq 1 && "$INSTALLED" -eq 1 ]]; then
  set +e
  xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE" \
    --json-output "$EVIDENCE/logs/doctor-launch.json" \
    >"$EVIDENCE/logs/doctor-launch.txt" 2>&1
  LEC=$?
  set -e
  if [[ "$LEC" -eq 0 ]]; then
    ok "launch"
  elif grep -q Locked "$EVIDENCE/logs/doctor-launch.txt" 2>/dev/null; then
    fail "device LOCKED — unlock iPhone 17 Pro, keep screen on"
  else
    fail "launch failed ec=$LEC"
  fi
fi

echo "TEAM=$TEAM BUNDLE=$BUNDLE ORIGIN_OK=$ORIGIN_OK DEVICE_OK=$DEVICE_OK INSTALLED=$INSTALLED"
echo "Doctor done $(ts)"
