# Kenos Apple apps (Phase 4A)

Local/dev foundation only. Placeholder bundle IDs:

- iOS/iPadOS: `space.kenos.app.ios`
- macOS: `space.kenos.app.macos`

## Generate + build

```bash
cd clients/apple/Apps
xcodegen generate
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPhone 16' -quiet build
xcodebuild -scheme KenosMac -destination 'platform=macOS' -quiet build
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPhone 16' test
xcodebuild -scheme KenosMac -destination 'platform=macOS' test
```

## Non-goals

- No App Store / TestFlight / notarization
- No production Team / App Group / push credentials
- No watchOS product target
- Approvals remain read-only (Executor off)
