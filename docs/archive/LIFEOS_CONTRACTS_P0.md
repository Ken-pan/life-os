# LifeOS P0 Contracts Reference

> `@life-os/contracts` — **cross-surface**，无 DOM/CSS/browser API
> Swift 映射：每个类型标注 `→ Swift` 建议
> PR 2 只创建 package scaffold；PR 3/4 才 export 本页 **P0 可 export** 表中的类型

---

## P0 export 范围

### P0 可 export

| Type                    | Module   | Notes                    |
| ----------------------- | -------- | ------------------------ |
| `ColorSchemePreference` | appearance | 与 brand/ambient 分离    |
| `BrandThemeID`          | appearance | 四 app 品牌              |
| `AmbientThemeSource`    | appearance | Music albumArt 等        |
| `ThemePreferenceModel`  | appearance | 组合上述三者             |
| `PageMetadata`          | meta     | 无 DOM                   |
| `EmptyStateModel`       | content  |                          |
| `UserAction`            | content  | 含 `intent`              |
| `SyncState`             | sync     |                          |
| `SyncErrorPresentation` | sync     |                          |
| `FeedbackMessage`       | feedback |                          |
| `NavItemModel`          | nav      | `href` web-only optional |
| `NavGroupModel`         | nav      |                          |
| `NavPresentation`       | nav      | tabBar / sidebar         |
| `SegControlModel`       | nav      |                          |
| `SegOption`             | nav      |                          |
| `OverlayState`          | feedback |                          |
| `OverlayKind`           | feedback |                          |
| `InsightSection`        | content  | 展示 only                |
| `RecommendationDisplay` | content  | 无 scoring               |

### P0 不 export（仅 docs / future）

| Type                       | 文档位置                     | 原因                      |
| -------------------------- | ---------------------------- | ------------------------- |
| `WidgetSnapshot`           | [`LIFEOS_NATIVE_READINESS.md`](../LIFEOS_NATIVE_READINESS.md) | 等 iOS MVP                |
| `LiveActivitySession`      | 同上                         | ActivityKit 未定型        |
| `WorkoutSessionSummary`    | 同上                         | HealthKit 未定型          |
| `PlaybackState`            | 同上                         | AVFoundation 未定型       |
| `SecurityCapability`       | 同上                         | Face ID / Keychain 未定型 |
| Native notification schema | 同上                         | UNNotification 映射待定   |
| HealthKit-related models   | 同上                         |                           |

---

## Type definitions（PR 3/4 source of truth）

### Appearance — 三层分离

**不要**把 Music albumArt ambient 与 light/dark/system 塞进单一 `ThemePreference` 字符串。

**命名规则**：contracts module 使用 `appearance`，例如 `@life-os/contracts/appearance`。不要把 contracts export module 命名为 `theme`；`@life-os/theme` 已经表示 web CSS/runtime package。

```typescript
/** cross-surface → Swift: enum ColorSchemePreference: String, Codable */
type ColorSchemePreference = 'light' | 'dark' | 'system'

/** cross-surface → Swift: enum BrandThemeID: String, Codable */
type BrandThemeID = 'planner' | 'fitness' | 'finance' | 'music'

/** cross-surface → Swift: enum AmbientThemeSource: String, Codable */
type AmbientThemeSource =
  | 'none'
  | 'albumArt' // Music now-playing / widget
  | 'coverMedia' // Fitness exercise cover
  | 'focusMode' // Fitness focus / distraction-free

/** cross-surface → Swift: struct ThemePreferenceModel: Codable */
type ThemePreferenceModel = {
  colorScheme: ColorSchemePreference
  brand: BrandThemeID
  ambient: AmbientThemeSource
}
```

**Web-only adapter**（`@life-os/platform-web`，不在 contracts）：

- 读写 localStorage / `data-theme` / CSS variables
- contracts 使用 `system`；现有 web runtime/storage 使用 `auto`
- P0 不迁移现有 app storage keys 或 storage values
- 将 `AmbientThemeSource.albumArt` 接到 Music `trackAmbience.js` 逻辑

```typescript
/** web-only adapter: contracts -> current web runtime */
function toWebThemePreference(
  pref: ColorSchemePreference,
): 'light' | 'dark' | 'auto'

/** web-only adapter: current web runtime -> contracts */
function fromWebThemePreference(
  pref: 'light' | 'dark' | 'auto',
): ColorSchemePreference
```

**Mapping**：

| contracts `ColorSchemePreference` | web runtime preference |
| --------------------------------- | ---------------------- |
| `light`                           | `light`                |
| `dark`                            | `dark`                 |
| `system`                          | `auto`                 |

Tests must cover `system -> auto` and `auto -> system` before any app pilot imports the adapter.

**iOS 映射**：

- `colorScheme` → `preferredColorScheme` / `@Environment(\.colorScheme)`
- `brand` → Asset catalog / `LifeOSDesignTokens` per app
- `ambient` → Now Playing artwork vibrancy / widget background

---

### Navigation

Native **不应依赖 pathname**。Web 专用路由放在 optional `href`。

```typescript
/** cross-surface → Swift: struct NavItemModel: Codable, Identifiable */
type NavItemModel = {
  id: string // primary key — Swift: LifeOSRouteID raw value
  label: string
  icon: string // semantic icon name; platform resolves to SF Symbol / Lucide
  /** web-only — pathname e.g. "/search". Omit on native. */
  href?: string
  /** cross-surface — how destination is presented */
  routeKind?: 'tab' | 'stack' | 'modal' | 'external'
}

/** cross-surface */
type NavGroupModel = {
  id: string
  label?: string
  items: NavItemModel[]
}

/** cross-surface → Swift: enum NavPresentation: String, Codable */
type NavPresentation = 'tabBar' | 'sidebar' | 'moreSheet'
```

**Swift 路由示例**（文档/reference，非 P0 代码）：

```swift
enum LifeOSRouteID: String, Codable {
  case today, inbox, upcoming, completed, search, settings
  // per-app extensions in app modules
}
```

---

### User actions — 统一语义

无 `onClick` / closure。Platform 层将 `id` 映射到 handler。

```typescript
/** cross-surface → Swift: enum UserActionIntent: String, Codable */
type UserActionIntent =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'retry'
  | 'dismiss'

/** cross-surface → Swift: struct UserAction: Codable, Identifiable */
type UserAction = {
  id: string
  label: string
  intent?: UserActionIntent
}
```

**复用于**：EmptyState、SyncError、Toast、Widget、Live Activity（future）。

---

### Page metadata

```typescript
/** cross-surface → Swift: struct PageMetadata: Codable */
type PageMetadata = {
  appId: BrandThemeID
  title: string
  locale?: string // BCP 47, e.g. "zh", "en"
}
```

Web-only：`applyDocumentMetaWeb(meta)` sets `<title>`, meta tags, `theme-color`.

---

### Empty state

```typescript
/** cross-surface */
type EmptyStateModel = {
  title: string
  hint?: string
  icon?: string
  variant?: 'default' | 'rich'
  action?: UserAction
}
```

Web-only：CSS `.empty` / `.empty-state` / `.lib-empty` mapping in ui-web docs.

---

### Sync & feedback

```typescript
/** cross-surface → Swift: enum SyncState: String, Codable */
type SyncState = 'idle' | 'syncing' | 'synced' | 'pending' | 'error'

/** cross-surface */
type SyncErrorPresentation = {
  message: string
  recoverable: boolean
  recoveryAction?: UserAction // intent: 'retry'
  dismissAction?: UserAction // intent: 'dismiss'
}

/** cross-surface */
type FeedbackMessage = {
  id: string
  body: string
  severity?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number // presentation hint; web toast policy applies
  action?: UserAction
}

/** cross-surface */
type OverlayKind = 'modal' | 'sheet' | 'drawer' | 'popover'

/** cross-surface */
type OverlayState = {
  kind: OverlayKind
  open: boolean
}
```

P1+ candidate web-only adapter：`SyncErrorBannerWebAdapter { subscribe(fn): unsubscribe }` in `@life-os/platform-web`. Not implemented in P0.

---

### Segmented control / filter chips

```typescript
type SegOption = { id: string; label: string }

/** cross-surface */
type SegControlModel = {
  value: string
  options: SegOption[]
  mode: 'single' | 'multi'
}
```

Web-only：`.seg` CSS, `filter-bar` layout. IME guard **not** part of this contract.

---

### Insights & recommendations (display only)

```typescript
/** cross-surface */
type InsightSection = {
  kind: 'risk' | 'suggestion' | 'anomaly' | 'info'
  items: string[]
}

/** cross-surface — no scores, no RPC payload */
type RecommendationDisplay = {
  title: string
  reasons: string[]
  confidenceLabel?: 'low' | 'medium' | 'high'
  source: string
}
```

Scoring / numeric confidence / ranking / sorting / RPC / coach rules → **app-only**.

---

## Dependency reminder

```
contracts  ← 不 import theme, platform-web, 或任何 app
platform-web  ← import contracts (types) + theme (browser helpers)
theme  ← 不 import contracts
```
