# Kenos Native Capability Bridge — 2026-07-21

## Goal

Give every Continuity domain a single native capability surface so the iOS shell can improve system UX without rewriting apps in SwiftUI.

## Shipped this slice

1. **Swift** `KenosNativeCapabilityBridge` + WK handler `kenosNative`
2. **JS** `@life-os/platform-web/kenos-native-bridge` (safe no-op outside shell)
3. **APIs:** `getCapabilities` / `haptic` / `share` / `authenticate` / `publishNavManifest` / `nowPlaying.*` / `liveActivity.*` / `openContinuity`
4. **Plan** leave-guard installs nav-manifest publisher + compose haptic
5. **Training** `FocusSession` haptic on set complete + nav-manifest publisher
6. **Music** Now Playing foundation (`KenosNowPlayingBridge` → lock screen / CC)
7. **Foundations (Owner-gated):** remote APNs, ActivityKit Live Activities, Widget embed/signing
8. **App Intents / Shortcuts** — Open Space / Start Training / Capture / Deep Work / shell destinations
9. **Local notifications** — schedule + tap → `kenos://` (remote APNs still gated)
10. **Widget glance** — host publishes App Group payload; extension reads when suite exists
11. **Spotlight + Apple Handoff** — `KenosSystemDiscovery` orchestrates privacy-safe deep links, debounce, stale-domain filter; Spotlight surface cache restores path; leave Domain resigns Handoff

## Owner gates (next)

See `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/OWNER_ACTION_NEXT.md`:

1. App Group `group.space.kenos.app` + embed Widget extension
2. APNs capability + certs → flip `KenosPushFoundation.remotePushEnabled`
3. ActivityKit / Live Activities → flip `KenosLiveActivityFoundation.isEnabled`
4. Focus interruption entitlement (separate)

## Code slices status

1. ~~Publish nav manifest from Training / Money / Health / Music / Home / Work / Library~~ **done**
2. ~~Money / Work: `ensureNativeUnlock` (Face ID session gate)~~ **done**
   - Root fix 2026-07-21: single-flight `LAContext`, `cancelAuthenticate` + `invalidate()`,
     180s auth timeout (not 15s), 10s biometry reuse after device unlock,
     generation-guarded `createNativeUnlockController` + Cancel on Money/Work gates
   - Remount fix: process-scoped `KenosUnlockGrantStore` (`storageKey`, default 15m) +
     `clearUnlockGrant` — survives WK reload / LAN `-1004` without re-prompting Face ID
     (cleared on cold launch / force / explicit clear; not written to disk)
   - Loop fix: `dispose()` no longer cancels LA; remount uses `prompt:false` (grant restore
     only); same `storageKey` coalesces in-flight Face ID; user taps Unlock to present LA
3. ~~Music: MPNowPlaying via `kenosNowPlaying.js`~~ **done**
4. ~~App Intents / Shortcuts~~ **done** — `KenosAppIntents` + `kenos://domain/*` deep links
5. ~~Live Activity upsert hooks~~ **done** (Training / Deep Work / Home tidy) — ActivityKit still Owner-gated
6. ~~Local notifications~~ **done** (UNUserNotificationCenter; APNs still Owner-gated)
7. ~~Widget glance publish/read~~ **partial** — App Group payload wired; Widget still not host-embedded until signing gate
8. ~~Spotlight + Apple Handoff (`NSUserActivity`)~~ **done** — Money/Work titles generic; Watch companion Handoff unchanged

## Verify

```bash
npm test -w @life-os/platform-web
cd clients/apple/Apps && xcodegen generate
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:KenosIOSTests/KenosNativeCapabilityBridgeTests \
  -only-testing:KenosIOSTests/KenosAppIntentsTests \
  -only-testing:KenosIOSTests/KenosSpotlightHandoffTests test
```
