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

## macOS Command Center (dogfood)

KenosMac is a **sidebar + detail** shell (not an iOS Dock clone):

| Surface             | Behavior                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| Sidebar             | Kenos / Spaces / System; domain accent icons; balanced split columns       |
| Kenos Mode          | Daily Beta ON → AIOS shell WK (`KenosMacShellSurface`); OFF → native pages |
| Spaces / Continuity | In-app Domain WK; Back ⌘[ · Forward ⌘] · Reload ⌘R · unreachable recovery  |
| Switch Space        | Toolbar Spaces / ⌘⇧S → `SpaceSwitcherSheet`                                |
| Command Bar         | ⌘⇧Space Quick Switch · ⌘1/2/3 Today/Assistant/Inbox                        |
| Capture             | ⌘N sheet · ⌘⇧N toolbar · Menu Bar draft                                    |
| Menu Bar            | Focus · Approvals · current Space · Capture · Leave Space                  |

Default Daily Beta origin: `http://127.0.0.1:5219` (Settings can save loopback or switch to production). ATS allows local networking. Non-goals: multi-window Assistant panel, Runtime/Vault, Live Activities, App Store / notarization.

## Apple Health (iOS)

KenosIOS requests HealthKit read access on launch for **core** metrics (sleep /
resting HR / HRV / steps) plus default activity metrics (active energy, exercise,
stand, distance, workouts). Settings → Apple Health lets you toggle more types
(mindful, SpO₂, respiratory rate, weight), change lookback (14/30d), sync, and
open the Health app.

Day aggregates are cached on-device and injected **only** into Health Continuity as
`window.__KENOS_APPLE_HEALTH__` (`days` + `enabledMetrics` / `coveredMetrics`).
Kenos shell (Today / Assistant) receives privacy-safe
`window.__KENOS_HEALTH_READINESS__` (levels / codes only — no vitals). Other
Continuity domains get neither. Empty HealthKit reads keep the prior local cache.

Optional Mac delivery: iCloud (`iCloud.space.kenos.healthos`) or LAN
`POST :5193/ingest` (extra fields pass through upsert).

Entitlements ship in `iOS/KenosIOS.entitlements` (HealthKit + iCloud container).
After changing `packages/platform-web` readiness/engine, regenerate the iOS
JSCore bundle: `node scripts/bundle-kenos-health-readiness-native.mjs`.

## Native capability bridge (iOS)

Unified JS ↔ Native surface for Continuity domains (`kenosNative` / `@life-os/platform-web/kenos-native-bridge`):

| Method                  | Status     | Notes                                                                         |
| ----------------------- | ---------- | ----------------------------------------------------------------------------- |
| `getCapabilities`       | shipped    | reports haptic/share/auth/nav/spotlight/userActivity + gated push/LA/appGroup |
| `haptic`                | shipped    | light/medium/heavy/soft/rigid/selection/success/warning/error/pulse           |
| `share`                 | shipped    | system share sheet                                                            |
| `authenticate`          | shipped    | Face ID / Touch ID / passcode (`NSFaceIDUsageDescription`)                    |
| `publishNavManifest`    | shipped    | Domain Navigation Manifest → dock `activeTab` + leave-guard / chrome          |
| `nowPlaying.*`          | shipped    | Music → MPNowPlayingInfoCenter (`KenosNowPlayingBridge`)                      |
| `liveActivity.*`        | shipped    | Upsert/end → in-shell Live Accessory + system ActivityKit when user-enabled   |
| `openContinuity`        | shipped    | Skip DomainLaunch intermediate page → Continuity WKWebView                    |
| Spotlight               | shipped    | Domain catalog + surface (`KenosSystemDiscovery` + Spotlight foundation)      |
| Apple Handoff           | shipped    | `NSUserActivity` via discovery (≠ Watch `KenosHandoff`); resign on leave      |
| App Intents / Shortcuts | shipped    | Open Space / Start Training / Capture / Deep Work / shell destinations        |
| Local notifications     | shipped    | Plan reminder schedules locally; tap → `kenos://` deep link                   |
| APNs remote push        | foundation | Owner-gated (`remotePushEnabled = false`)                                     |
| Widget glance           | dogfood    | App Group `group.space.kenos.app` + full snapshot (Today / Spaces / domains)  |

All Continuity domains publish nav manifests. Compose is wired on Plan / Library /
Work / Money / Home / Health / Music / Training. Training fires haptic on set
complete; Music drives lock-screen Now Playing; Money/Work require Face ID session
unlock (`ensureNativeUnlock`) in the native shell.

### Sensory vocabulary (haptic-first)

Web Continuity uses `@life-os/platform-web/kenos-sensory` (`sensory(intent)`), which
prefers `kenosNative.haptic` and falls back to `navigator.vibrate` on Android PWA.
Do **not** call `navigator.vibrate` alone — it is a no-op in iOS WKWebView.

| Intent    | When                                    | Native style                  |
| --------- | --------------------------------------- | ----------------------------- |
| `select`  | option change                           | selection                     |
| `tick`    | swipe threshold / countdown tick        | rigid                         |
| `soft`    | compose open / send                     | soft                          |
| `commit`  | set logged (mid-exercise)               | medium                        |
| `success` | task done / approve / PR / capture save | success                       |
| `warn`    | rest warn / reject                      | warning                       |
| `error`   | save/decide failure                     | error                         |
| `pulse`   | rest / session complete                 | native `pulse` (heavy→medium) |

Shell chrome already owns Dock selection, Shelf threshold, and Mode-flip soft impact.
Timed **audio** cues stay on Training WebAudio (`settings.sound`); haptics for rest cues
still fire when sound is off. No general UI click sounds. Per-intent throttle avoids spam.

Feel-test on device: Dock tab · Shelf threshold · Plan complete · Training rest end ·
Approval decide · Capture save · Tidy last item. Mute Training sound → chime off, pulse on;
system Haptics Off disables vibration.

### Home Screen / Lock Screen Widgets

Dogfood suite (KenosWidget extension):

| Widget      | Families                                            | Notes                                                           |
| ----------- | --------------------------------------------------- | --------------------------------------------------------------- |
| Kenos Today | small, medium, accessoryCircular/Rectangular/Inline | Next Plan + Approvals/Inbox; medium Capture / Assistant buttons |
| Spaces      | medium, large                                       | Domain grid → `kenos://domain/<id>`                             |
| Plan        | small, medium                                       | Next task glance                                                |
| Training    | small, medium                                       | Session / Start Training                                        |
| Music       | small, medium                                       | Now Playing subtitle (no artwork fetch)                         |
| Health      | small, accessoryCircular                            | **Readiness levels/codes only** — no vitals                     |
| Home        | small                                               | Tidy / organize                                                 |

Host publishes `KenosWidgetSnapshot` via App Group (`KenosWidgetGlanceBridge`); Widget
reloads with `WidgetCenter.reloadAllTimelines()`. Interactive buttons queue a pending
deep link (`widget.pendingDeepLink`) consumed on foreground.

App Group id `group.space.kenos.app` is wired in KenosIOS + KenosWidget entitlements
for dogfood (**EXIT_OPEN** — not a production Team cutover).

### Live Activities (ActivityKit)

Shipped path:

1. `NSSupportsLiveActivities` (+ frequent updates) in host Info.plist
2. `KenosDomainActivityAttributes` shared by KenosIOS + KenosWidget
3. `KenosLiveActivityWidget` — Lock Screen + Dynamic Island (`training` / `focus` / `tidy`) with kind captions
4. `KenosLiveActivityFoundation` requests/updates/ends via ActivityKit when
   `ActivityAuthorizationInfo.areActivitiesEnabled` (Settings → Live Activities)
5. KenosWidget is embedded in KenosIOS (`project.yml`)

Tap deep links: `kenos://training/session`, `kenos://work`, `kenos://domain/home?path=/tidy/go`.

Dogfood on a physical iPhone (Dynamic Island / Lock Screen). Simulator may allow
`Activity.request` but does not show the full Island UI. Push-to-update APNs is
still deferred (`pushType: nil`).

## Diagnostics & logs (iOS)

Native logging for dogfood / iteration lives in `Shared/KenosLog*.swift`:

- Levels: trace → fault; categories: lifecycle, navigation, shell, web, bridge, health, …
- Mirrors to Console.app (`subsystem` = bundle id)
- In-memory ring (~2000) + rotating JSONL under Caches/`kenos-logs/`
- Tokens / JWTs / Supabase publishable keys are redacted before persist
- Web `console.warn` / `console.error` / `onerror` forward via `kenosNativeLog`
- Settings → **Diagnostics & Logs** — filter, auto-refresh, export, **Supabase sync**
- Cloud: `kenos_app_log_sessions` + `kenos_app_logs` via RPC `kenos_ingest_app_logs`
  (migration `apps/finance/supabase/migrations/20260721144405_kenos_app_logs.sql`)
- Auto-upload: startup retries (3s/8s/18s) → every ~45s; also on first content,
  webview didFinish, foreground/active, and background (JWT cached ~50m so
  background flush works after sign-in). Bug Report attach sets `bug_id`
- Requires Kenos web shell sign-in (JWT) + portal membership for `bug_logs` app=`kenos`
- Toggle **Sync to Supabase** in Diagnostics (default ON); cloud floor defaults to Notice+
- **Crash auto-report:** MetricKit → `KenosCrashReporter`
  - Logs crash/hang/cpu/disk/appLaunch under category `diagnostics`
  - Severe kinds (`crash` / `hang` / `cpuException`) auto-queue a high-severity
    `bug_logs` row (`captureSource=metrickit`) + attach native logs when signed in
  - Unclean previous exit (no `willTerminate`) logs a fault for cloud sync
  - Pending packages: Caches/`kenos-crash-reports/` (flush on launch + become-active)

```bash
# Console.app / Simulator: filter subsystem
space.kenos.app.ios

# Inspect uploaded rows (as your user)
# select * from kenos_app_logs order by logged_at desc limit 20;
# select * from bug_logs where metadata->>'captureSource' = 'metrickit' order by created_at desc limit 20;
```

## Non-goals

- No App Store / TestFlight / notarization / production APNs
- No production Team cutover / push credentials (App Group id is dogfood-wired; Team provision still Owner gate)
- Approvals remain read-only (Executor off)
- Phase 5 proactive automation off
