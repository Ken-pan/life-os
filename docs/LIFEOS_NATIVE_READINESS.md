# LifeOS Native Readiness

> Future iOS (SwiftUI / LifeOSKit) — **docs only in P0**
> 不创建 Swift 文件、Xcode 工程、或 P0 contracts export
> 边界与依赖：[`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md)

---

## LifeOSKit（future，仅概念）

- Swift package consuming Swift types mirrored from `@life-os/contracts`
- SwiftUI `DesignTokens` mapped from `@life-os/theme` token **names** (not CSS)
- Per-app modules: `LifeOSPlannerKit`, `LifeOSFitnessKit`, etc.
- **Does not import** `@life-os/theme` CSS

---

## Native Readiness Matrix

| Capability              | Web/PWA current                              | Native iOS equivalent                                    | Shared contract (P0)?                          | Keep web-only?               | Notes                                                 |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| Navigation IA           | `nav.js`, 4-tab+More, shell.css              | `TabView`, `NavigationSplitView`                         | **Yes** — `NavItemModel`, `NavPresentation`    | `href` pathname **web-only** | Native uses `id` / `LifeOSRouteID`                    |
| Color scheme            | current runtime uses `auto` via localStorage | `@AppStorage`, `preferredColorScheme`                    | **Yes** — `ColorSchemePreference` (`system`)   | `system <-> auto` adapter    | Separated from ambient                                |
| Brand theme             | app `:root` CSS                              | Asset catalog / DesignTokens                             | **Yes** — `BrandThemeID`                       | CSS variables                |                                                       |
| Ambient theme           | Music `--track-accent`, Fitness cover        | Now Playing artwork, widget bg                           | **Yes** — `AmbientThemeSource`                 | CSS injection                | **Not** same as dark/light                            |
| Page metadata           | `DocumentHead`, `siteMeta.js`                | `navigationTitle`, `userActivity`                        | **Yes** — `PageMetadata`                       | DOM meta tags                |                                                       |
| Empty state             | `EmptyState.svelte`, `.empty*` classes       | `ContentUnavailableView`                                 | **Yes** — `EmptyStateModel`                    | CSS/markup                   |                                                       |
| Sync status/error       | `SyncErrorBanner`, `@life-os/sync`           | Banner / Settings status                                 | **Yes** — `SyncState`, `SyncErrorPresentation` | DOM subscribe                |                                                       |
| Toast/feedback          | `toastPolicy.js`, `.toast`                   | Banner / transient overlay                               | **Yes** — `FeedbackMessage`, `UserAction`      | dedupe impl                  |                                                       |
| Overlay lifecycle       | sheet, focus trap, scroll lock               | `.sheet`, `.fullScreenCover`                             | **Yes** — `OverlayState`, `OverlayKind`        | trap/scroll                  |                                                       |
| Search input            | pages + `GlobalSearch`                       | `.searchable`                                            | **Partial** — future `SearchQuery`             | **IME guard web-only**       | P1 contract                                           |
| Filter chips            | `.seg`                                       | `Picker`, segmented control                              | **Yes** — `SegControlModel`                    | CSS                          |                                                       |
| Insights display        | `InsightCard`, `AiBriefCard`                 | grouped `List`                                           | **Yes** — `InsightSection`                     | LLM fetch                    |                                                       |
| Recommendations display | cards / coach / RPC UI                       | recommendation card                                      | **Yes** — `RecommendationDisplay`              | scoring **app-only**         |                                                       |
| Notifications           | Web Push + Badging for Home Screen web apps  | `UNUserNotificationCenter` local scheduled notifications | **P1+ split contracts**                        | web push/badge adapter       | Do not conflate web push with native local scheduling |
| Local reminders         | Planner reminders, IDB                       | `UNUserNotificationCenter`                               | **P1+ native contract**                        | browser permission/UI        | Not P0                                                |
| Widgets                 | PWA limited                                  | WidgetKit                                                | **Docs only** — `WidgetSnapshot` below         | UI native-only               |                                                       |
| Live Activities         | Fitness web timer                            | ActivityKit                                              | **Docs only** — `LiveActivitySession` below    | native-only                  |                                                       |
| App Intents             | —                                            | App Intents                                              | **P1+ docs**                                   | handlers native              |                                                       |
| Background sync         | `@life-os/sync`                              | BGAppRefresh                                             | **P1+** — `SyncPolicy`                         | visibility hooks web         |                                                       |
| Offline storage         | localStorage, Dexie                          | Core Data, files                                         | **No API contract P0**                         | **web-only**                 | Entity shapes in app                                  |
| Media playback          | `player.svelte.js`, MediaSession             | AVAudioSession, Now Playing                              | **Docs only** — `PlaybackState`                | player UI app-only           |                                                       |
| Health / workout        | Focus web                                    | HealthKit, Watch                                         | **Docs only** — `WorkoutSessionSummary`        | session UI app-only          |                                                       |
| Finance security        | web auth, device list                        | Keychain, Face ID                                        | **Docs only** — `SecurityCapability`           | extension capture web        |                                                       |

---

## Future types（docs only — 不进 P0 contracts export）

### WidgetSnapshot

```typescript
// FUTURE — document only until iOS widget MVP scoped
type WidgetSnapshot = {
  appId: BrandThemeID
  widgetKind: string
  title: string
  subtitle?: string
  value?: string
  updatedAt: string // ISO8601
  deepLinkRouteId?: string
}
```

### LiveActivitySession

```typescript
// FUTURE — Fitness rest timer candidate
type LiveActivitySession = {
  id: string
  appId: 'fitness'
  kind: 'restTimer' | 'workout'
  label: string
  endsAt?: string // ISO8601
  progress?: number // 0..1
}
```

### PlaybackState

```typescript
// FUTURE — Music native-first
type PlaybackState = {
  trackId: string
  title: string
  artist: string
  isPlaying: boolean
  positionMs: number
  durationMs: number
}
```

### WorkoutSessionSummary

```typescript
// FUTURE — HealthKit path
type WorkoutSessionSummary = {
  sessionId: string
  dayId: string
  startedAt: string
  endedAt?: string
  exerciseCount: number
}
```

### SecurityCapability

```typescript
// FUTURE — Finance native-first
type SecurityCapability = {
  biometricGate: boolean
  requireDeviceEnrollment: boolean
}
```

**Rule**：上述类型写入本文档；**PR 3/4 不 export**。iOS MVP 确认后再加入 `@life-os/contracts`。

---

## iOS Opportunity Map

| Platform      | Best native iOS opportunities                                                                       | Native first?                                         | Hybrid OK?                                       | Risks                             |
| ------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| **PlannerOS** | Widgets（今日/下一任务）；native local notifications；App Intents 快速添加；Calendar 集成（待验证） | Hybrid — widgets/local notifications **native-first** | Web 主 app + extensions；Web Push/Badging 可 P1+ | Reminder 权限；Supabase sync 一致 |
| **FitnessOS** | HealthKit；Apple Watch；Live Activity 休息计时；haptics                                             | **Native-first** Focus/Timer/Watch                    | Program 浏览可 web                               | HealthKit 审核；重复建设          |
| **MusicOS**   | Background audio；锁屏 Now Playing；CarPlay；离线库                                                 | **Native-first** playback                             | Import/settings 可 web                           | Dexie vs AVFoundation             |
| **FinanceOS** | Face ID；Keychain；widgets（余额/预算）；privacy manifest                                           | **Native-first** auth/敏感数据                        | 图表 desktop web                                 | 无 extension capture on iOS       |

---

## PWA assumptions that block native（mitigation）

| Assumption                      | Block                  | Mitigation                                                                                  |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| Nav `href` pathname             | iOS uses route IDs     | `NavItemModel.id` required; `href?` web-only                                                |
| Single `ThemePreference` string | Ambient ≠ color scheme | Split `ThemePreferenceModel`; web adapter maps contracts `system` to current runtime `auto` |
| localStorage theme keys         | Keychain / App Group   | platform-web adapter only                                                                   |
| SyncError DOM subscribe         | SwiftUI observable     | `SyncErrorPresentation` in contracts                                                        |
| Dexie / localStorage entities   | Core Data              | app-only storage; metadata in app types                                                     |
| IME guard on search             | N/A on iOS             | web-only in platform-web                                                                    |
| CSS class as API                | SwiftUI styles         | contracts = model; theme = web                                                              |

---

## Token → SwiftUI mapping（reference）

| Web token (theme) | SwiftUI semantic (future)                |
| ----------------- | ---------------------------------------- |
| `--space-4`       | `LifeOSSpacing.sm`                       |
| `--text-base`     | `LifeOSFontSize.body`                    |
| `--radius-md`     | `LifeOSRadius.md`                        |
| `--t1` / `--text` | `Color.textPrimary`                      |
| `--accent`        | `Color.brandAccent` (per `BrandThemeID`) |
| `--positive`      | `Color.semanticPositive`                 |

Full table expansion in P1 when LifeOSKit scoped.

---

## Related

- [`LIFEOS_CONTRACTS.md`](./LIFEOS_CONTRACTS.md) — export 白名单
- [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) — 依赖规则
