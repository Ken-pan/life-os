# Kenos Apple apps (Phase 4A/4B)

Local/dev foundation only. Placeholder bundle IDs:

- iOS/iPadOS: `space.kenos.app.ios`
- watchOS companion: `space.kenos.app.ios.watch`
- Widget extension: `space.kenos.app.ios.widget`
- macOS: `space.kenos.app.macos`
- App Group placeholder: `group.space.kenos.app` (not production-applied)

## Generate + build

```bash
cd clients/apple/Apps
xcodegen generate
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPhone 17' build test
xcodebuild -scheme KenosWatch -destination 'platform=watchOS Simulator,name=Apple Watch SE 3 (40mm)' build test
xcodebuild -scheme KenosMac -destination 'platform=macOS' build test
```

## Non-goals

- No App Store / TestFlight / notarization / production APNs
- No production Team / App Group / push credentials
- Approvals remain read-only (Executor off)
- Phase 5 proactive automation off
