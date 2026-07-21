# Kenos iOS UX Framework — implementation slice 2026-07-21

**Does not close Phase 4.** Does not claim production ship. LAN is preferred for dogfood; production fallback makes cellular / Mac-sleep usable.

## Shipped in code

### Wave A — Availability

- Domain Continuity soft health probe + unreachable UI (`KenosDomainModeShell`)
- Shell unreachable copy distinguishes LAN vs non-LAN origins
- `KenosWebRuntime.invalidateReachability()` on origin save / Retry
- `kenosDailyBetaOriginDidChange` notification reloads surfaces
- `DomainLaunch` in `iosNativeShell` calls `nativeOpenContinuity` (bridge `openContinuity`)
- **Production fallback:** LAN probe failure → `https://aios.kenos.space` + domain `*.kenos.space`. Settings: toggle / Use Production / Retry LAN. **Default `preferProductionFallback` is OFF** until `aios.kenos.space` DNS is an Owner canary (code: `KenosDailyBetaConfig`).

### Wave B — Chrome contract

- Planner: BottomNav + FAB not mounted when native shell
- `publishNavManifest.activeTab` → Domain dock slot sync (Training/Money/Music/Health aligned to Registry)
- Overlay liveStates: `editing|drawer|sheet|capturing|scanning|immersive|compose` hide dock
- Platform + Fitness FAB / `lib-top-fab` hide; TimerWidget `.tw` raised above Domain Dock
- Paper Continuity dock reduced to one honest stub slot (legacy_fallback)

### Wave C — Live context

- Unified `liveAccessory`: Capture draft · Focus return · LiveActivity · Music · Training manifest · resume heuristic
- Space Shelf sections: System · **Active** · Recent · Pinned · **All Spaces**
- FocusReturnBanner suppressed when Live Accessory owns `.focus`

### Wave D — System presence / polish

- Bug Report: **Attach diagnostics logs** toggle default ON (remote + local package)
- Settings: Feedback vs Diagnostics split; LAN origin hint
- Live Accessory + Space Shelf use Dynamic Type–friendly fonts (`@ScaledMetric` / semantic text styles)
- Push local `registerIfEnabled` (already in bootstrap); LiveActivity upsert posts `kenosLiveActivityDidChange`
- App Intents / Shortcuts shipped (`KenosAppIntents.swift`)
- ActivityKit / remote APNs remain Owner-gated (`isEnabled = false`)

### Optimization pass (2026-07-21 evening)

- **WK cold-start warmup:** hidden seed WKWebView at `didFinishLaunching` (process-pool sharing obsolete on modern iOS)
- **Live Accessory minimize:** web scroll-down → compact Music-style chip; scroll-up expands (custom-dock stand-in for `tabViewBottomAccessory`)
- **Live Activity:** default `staleDate` (endsAt or +8h); compact prefers timer/progress; expanded **Open** link
- **MetricKit:** `KenosMetricKitSubscriber` logs launch/memory/hang/diagnostic summaries (local KenosLog only)
- **Quick Switch:** Search-role sheet — always-visible search field, auto-focus, medium detent first

### Optimization pass 2 (2026-07-21 — Chrome 合同 + 壳性能)

- **Money overlay `liveState`:** drawers → `drawer`/`compose`; Domain Dock hides (was stuck `idle`)
- **Finance:** native shell **unmounts** tabbar (no CSS hide debt)
- **Training sheets:** SetLog / Tool / Knowledge / Weight / Skip → `liveState: sheet` + immediate publish
- **AIOS `iosNativeShell`:** re-exports `@life-os/platform-web/ios-native-shell` (chrome CSS SSOT)
- **Dynamic `bottomPadPx`:** dock + Live Accessory (expanded 80 / minimized 52); immersive `.none` skips accessory
- **`softNavigate` fallback:** 0.65s (was 0.32); cancelled by `kenosPath` / `didFinish`
- **Inactive Continuity TTL:** 90s in Kenos Mode releases non-Music warm Domain WK; Music Now Playing still exempt
- **WK warmup:** seed uses `.default()` data store (aligned with real surfaces)
- Does **not** flip APNs / ActivityKit / Phase 4 EXIT_OPEN

## Owner still required

1. Phone-reachable / public Daily Beta origin (exit LAN-only)
2. Flip `KenosLiveActivityFoundation.isEnabled` after ActivityKit entitlement
3. Flip `KenosPushFoundation.remotePushEnabled` after APNs
4. Dogfood 3–7 days Stabilization exit

## Verify

```bash
npm test -w finance-os -- src/lib/kenos/financeSpaceAdapter.test.js
node --import ./apps/fitness/scripts/lib/register-alias.mjs \
  apps/fitness/src/lib/kenos/fitnessSpaceAdapter.test.js
npm test -w @life-os/platform-web -- iosNativeShell
cd clients/apple/Apps && xcodegen generate
xcodebuild -scheme KenosIOS -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:KenosIOSTests test
```
