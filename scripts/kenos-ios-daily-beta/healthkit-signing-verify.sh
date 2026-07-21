#!/usr/bin/env bash
# Provision HealthKit for KenosIOS, rebuild, and verify the entitlement is embedded.
# Prerequisite: Xcode → Settings → Accounts signed in as team 93NJ4CAU8B (Pan Juncheng).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPS="$ROOT/clients/apple/Apps"
DERIVED="${KENOS_IOS_DERIVED:-$APPS/build-device-healthkit}"
TEAM="${KENOS_IOS_TEAM:-93NJ4CAU8B}"
BUNDLE_ID="space.kenos.app.ios"

accounts="$(defaults read com.apple.dt.Xcode DVTDeveloperAccountManagerAppleIDLists 2>/dev/null || true)"
if ! printf '%s' "$accounts" | grep -q '@'; then
  echo "ERROR: Xcode has no Apple ID accounts." >&2
  echo "  1) Xcode → Settings → Accounts → + → sign in (team $TEAM / Pan Juncheng)" >&2
  echo "  2) Re-run: $0" >&2
  open -a Xcode "$APPS/Kenos.xcodeproj" || true
  exit 2
fi

command -v xcodegen >/dev/null || { echo "ERROR: brew install xcodegen" >&2; exit 1; }
cd "$APPS"
xcodegen generate

echo "==> Building KenosIOS (team=$TEAM, HealthKit entitlements)…"
xcodebuild \
  -project Kenos.xcodeproj \
  -scheme KenosIOS \
  -configuration Debug \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$(date -u +%Y%m%d%H%M)" \
  MARKETING_VERSION=1.0.0 \
  build

APP="$DERIVED/Build/Products/Debug-iphoneos/KenosIOS.app"
[[ -d "$APP" ]] || { echo "ERROR: missing $APP" >&2; exit 1; }

ENTS="$(mktemp)"
codesign -d --entitlements - "$APP" 2>/dev/null >"$ENTS" || true
if ! grep -q "com.apple.developer.healthkit" "$ENTS"; then
  echo "ERROR: built app still lacks HealthKit entitlement." >&2
  echo "  In Xcode: KenosIOS target → Signing & Capabilities → + Capability → HealthKit" >&2
  echo "  Ensure Automatic signing creates an explicit App ID (not wildcard *)." >&2
  cat "$ENTS" >&2 || true
  rm -f "$ENTS"
  exit 3
fi
rm -f "$ENTS"

echo "OK: HealthKit entitlement present in $APP"
echo "    Bundle: $BUNDLE_ID"
echo "Next: unlock iPhone, then:"
echo "  ./scripts/kenos-ios-daily-beta/device-build-install.sh"
echo "On device: Settings → Connections → Apple Health → Connect Apple Health"
