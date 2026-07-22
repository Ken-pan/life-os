#!/usr/bin/env bash
# Reproducible Kenos iOS Daily Beta — build + install to paired iPhone.
# Usage:
#   ./scripts/kenos-ios-daily-beta/device-build-install.sh
# Env:
#   KENOS_IOS_TEAM          — Apple Development Team ID (default 93NJ4CAU8B)
#   KENOS_IOS_DEVICE        — device identifier (default Ken’s 17 Pro)
#   KENOS_DAILY_BETA_ORIGIN — phone-reachable origin (default http://<en0>:5219)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPS="$ROOT/clients/apple/Apps"
DERIVED="${KENOS_IOS_DERIVED:-$APPS/build-device}"
TEAM="${KENOS_IOS_TEAM:-93NJ4CAU8B}"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
# Default: Ken’s 17 Pro (formal Daily Beta acceptance device).
# 15 Pro (wired assist only): KENOS_IOS_DEVICE=DB1122B8-C6A8-5DB2-958B-637D01E25BF5
BUNDLE_ID="space.kenos.app.ios"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
LOCAL_HOST="$(scutil --get LocalHostName 2>/dev/null || true)"
TRUST_JSON="${KENOS_DAILY_BETA_HOME:-$HOME/.kenos-daily-beta}/device-trust.json"
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-}"
if [[ -z "$ORIGIN" ]]; then
  # Prefer Tailscale MagicDNS pair (Mac ↔ this iPhone only) over Bonjour / DHCP.
  if [[ -f "$TRUST_JSON" ]]; then
    TS_ORIGIN="$(python3 - "$TRUST_JSON" <<'PY' 2>/dev/null || true
import json, sys
d = json.loads(open(sys.argv[1], encoding="utf-8").read())
print((d.get("shell") or {}).get("origin") or "")
PY
)"
    if [[ -n "$TS_ORIGIN" ]]; then
      ORIGIN="$TS_ORIGIN"
    fi
  fi
fi
if [[ -z "$ORIGIN" ]]; then
  if [[ -n "$LOCAL_HOST" ]]; then
    # Stable mDNS — survives DHCP IP churn without rebuilding.
    ORIGIN="http://${LOCAL_HOST}.local:5219"
  elif [[ -n "$LAN_IP" ]]; then
    echo "WARN: LocalHostName missing — falling back to DHCP IP (P1 residual)" >&2
    ORIGIN="http://${LAN_IP}:5219"
  else
    echo "ERROR: set KENOS_DAILY_BETA_ORIGIN (prefer Tailscale MagicDNS from device-trust.json)" >&2
    exit 1
  fi
fi
case "$ORIGIN" in
  *127.0.0.1*|*localhost*)
    echo "ERROR: origin must be phone-reachable — refused: $ORIGIN" >&2
    exit 1
    ;;
esac
# Refuse baking a raw IPv4 into the app unless Owner explicitly forces it.
if [[ -z "${KENOS_ALLOW_DHCP_IP_ORIGIN:-}" ]]; then
  host_part="${ORIGIN#http://}"
  host_part="${host_part#https://}"
  host_part="${host_part%%/*}"
  host_part="${host_part%%:*}"
  if [[ "$host_part" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: refusing DHCP IPv4 origin '$ORIGIN'." >&2
    echo "  Use http://\$(scutil --get LocalHostName).local:5219" >&2
    echo "  Or set KENOS_ALLOW_DHCP_IP_ORIGIN=1 to override (not recommended)." >&2
    exit 1
  fi
fi

echo "==> Daily Beta origin: $ORIGIN"
echo "==> Device: $DEVICE"
echo "==> Team: $TEAM"

# Ensure Mac static servers bind for LAN
export KENOS_STATIC_BIND=0.0.0.0
if [[ -x "$ROOT/scripts/kenos-daily-beta/kenos-ctl.sh" ]]; then
  "$ROOT/scripts/kenos-daily-beta/kenos-ctl.sh" restart || true
  mkdir -p "$HOME/.kenos-daily-beta"
  echo "$ORIGIN" >"$HOME/.kenos-daily-beta/lan-origin.txt"
fi

command -v xcodegen >/dev/null || { echo "ERROR: brew install xcodegen" >&2; exit 1; }
cd "$APPS"
xcodegen generate

SHA="$(git -C "$ROOT" rev-parse HEAD)"
BUILD_NUM="$(date -u +%Y%m%d%H%M)"
echo "$SHA" >"$HOME/.kenos-daily-beta/ios-build-sha.txt"
echo "$BUILD_NUM" >"$HOME/.kenos-daily-beta/ios-build-number.txt"

xcodebuild \
  -project Kenos.xcodeproj \
  -scheme KenosIOS \
  -configuration Debug \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic \
  KENOS_DAILY_BETA_ORIGIN="$ORIGIN" \
  CURRENT_PROJECT_VERSION="$BUILD_NUM" \
  MARKETING_VERSION=1.0.0 \
  build
BUILD_EC=$?
if [[ "$BUILD_EC" -ne 0 ]]; then
  echo "ERROR: xcodebuild failed exit=$BUILD_EC" >&2
  exit "$BUILD_EC"
fi

APP="$DERIVED/Build/Products/Debug-iphoneos/KenosIOS.app"
[[ -d "$APP" ]] || { echo "ERROR: missing $APP" >&2; exit 1; }
echo "==> CFBundleVersion=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist" 2>/dev/null || echo unknown)"

# Archive dSYMs next to Daily Beta home so MetricKit `binary +offset` frames can be
# symbolicated later (industry baseline — without this, topFrames stay opaque).
DSYM_ROOT="${KENOS_DAILY_BETA_HOME:-$HOME/.kenos-daily-beta}/dsyms"
DSYM_DIR="$DSYM_ROOT/$BUILD_NUM"
mkdir -p "$DSYM_DIR"
while IFS= read -r -d '' dsym; do
  cp -R "$dsym" "$DSYM_DIR/" 2>/dev/null || true
done < <(find "$DERIVED/Build/Products/Debug-iphoneos" -name '*.dSYM' -print0 2>/dev/null)
# Debug builds may embed DWARF only — synthesize dSYMs with dsymutil.
if ! find "$DSYM_DIR" -name '*.dSYM' -maxdepth 1 | grep -q .; then
  if [[ -x "$APP/KenosIOS" ]]; then
    dsymutil "$APP/KenosIOS" -o "$DSYM_DIR/KenosIOS.app.dSYM" 2>/dev/null || true
  fi
  if [[ -f "$APP/KenosIOS.debug.dylib" ]]; then
    dsymutil "$APP/KenosIOS.debug.dylib" -o "$DSYM_DIR/KenosIOS.debug.dylib.dSYM" 2>/dev/null || true
  fi
fi
{
  echo "build=$BUILD_NUM"
  echo "sha=$SHA"
  echo "origin=$ORIGIN"
  echo "archivedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if command -v dwarfdump >/dev/null; then
    find "$DSYM_DIR" \( -name '*.dSYM' -o -name 'KenosIOS' -o -name '*.dylib' \) 2>/dev/null | while read -r d; do
      dwarfdump --uuid "$d" 2>/dev/null || true
    done
  fi
} >"$DSYM_DIR/README.txt"
echo "$BUILD_NUM $SHA $(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$DSYM_ROOT/index.txt"
echo "==> dSYMs archived → $DSYM_DIR ($(find "$DSYM_DIR" -name '*.dSYM' | wc -l | tr -d ' ') bundles)"

echo "==> Installing $APP"
set +e
xcrun devicectl device install app --device "$DEVICE" "$APP"
INSTALL_EC=$?
set -e
if [[ "$INSTALL_EC" -ne 0 ]]; then
  echo "ERROR: install failed ec=$INSTALL_EC (check provisioning / device UDID in Team profile)" >&2
  exit "$INSTALL_EC"
fi

echo "==> Launching $BUNDLE_ID (unlock phone if needed)"
set +e
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
  --payload-url "${ORIGIN}/?iosNativeShell=1" \
  "$BUNDLE_ID"
LAUNCH_EC=$?
set -e

echo "INSTALL_OK origin=$ORIGIN sha=$SHA build=$BUILD_NUM launch_ec=$LAUNCH_EC"
# Launch may fail if Locked — install already succeeded
exit 0
