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
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-}"
if [[ -z "$ORIGIN" ]]; then
  if [[ -n "$LAN_IP" ]]; then
    ORIGIN="http://${LAN_IP}:5219"
  else
    echo "ERROR: set KENOS_DAILY_BETA_ORIGIN (phone-reachable, not 127.0.0.1)" >&2
    exit 1
  fi
fi
case "$ORIGIN" in
  *127.0.0.1*|*localhost*)
    echo "ERROR: origin must be phone-reachable — refused: $ORIGIN" >&2
    exit 1
    ;;
esac

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
