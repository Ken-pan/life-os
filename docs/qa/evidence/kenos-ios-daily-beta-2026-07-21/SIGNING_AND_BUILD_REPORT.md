# SIGNING_AND_BUILD_REPORT — Kenos iOS Daily Beta

**run_id:** `ios-daily-beta-2026-07-21T03:27Z`
**HEAD SHA:** `d8ec099ca92055bda74bc0b41bacc5708b303348`
**app version / build:** `1.0.0` / device reports `20260721` (Info.plist historically hard-coded; build stamp file `~/.kenos-daily-beta/ios-build-number.txt` = `202607210317`)

## Target

| Item | Value |
| --- | --- |
| Xcode project | `clients/apple/Apps/Kenos.xcodeproj` (XcodeGen from `project.yml`) |
| Scheme / target | `KenosIOS` |
| Bundle ID | `space.kenos.app.ios` |
| Configuration | Debug (Daily Beta) |
| Team | `93NJ4CAU8B` |
| Style | Automatic signing |
| Identity | Apple Development: Pan Juncheng (`24LGFN37R4`) |
| Provisioning | Development profile for team `93NJ4CAU8B` includes UDID `00008150-…` (17 Pro) |

## Entitlements / capability notes

- URL scheme: `kenos://`
- ATS: `NSAllowsLocalNetworking` + private CIDR HTTP exceptions for LAN Daily Beta
- Local Network usage string present
- App Group / APNs / Watch distribution: **EXIT_OPEN** (not required for this Daily Beta LAN slice)

## Commands

```bash
./scripts/kenos-ios-daily-beta/ios-beta-doctor.sh
KENOS_DAILY_BETA_ORIGIN="http://$(ipconfig getifaddr en0):5219" \
  ./scripts/kenos-ios-daily-beta/device-build-install.sh
./scripts/kenos-ios-daily-beta/ios-beta-launch.sh /
./scripts/kenos-ios-daily-beta/real-device-smoke.sh
```

## Fixes this slice

- Default device for install scripts → **17 Pro**
- Build destination → `generic/platform=iOS` (avoids unavailable-device xcodebuild destination failures)
- `CFBundleVersion` → `$(CURRENT_PROJECT_VERSION)` (stop hard-coded `20260721`)

## Exit

| Assertion | Status |
| --- | --- |
| Correct iOS target only (no second app) | PASS |
| Team + Automatic signing | PASS |
| Profile includes 17 Pro | PASS |
| Production distribution unchanged | PASS |
| No secrets in plist / xcconfig | PASS |
