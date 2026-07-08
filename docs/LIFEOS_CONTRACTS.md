# Life OS Contracts Reference

> `@life-os/contracts` — **cross-surface** 产品契约；无 DOM/CSS/browser API
> **源码真源：** `packages/contracts/src/`（`.d.ts` + `events.ts`）
> 边界与阶段：[`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md)

**最后与代码同步：** 2026-07-08（8 模块：appearance, meta, sync, nav, content, feedback, events + index）

---

## Export 白名单

### 可 export

| Type                                                     | Module     | Notes                       |
| -------------------------------------------------------- | ---------- | --------------------------- |
| `ColorSchemePreference`                                  | appearance | 与 brand/ambient 分离       |
| `BrandThemeID`                                           | appearance | 四 app 品牌                 |
| `AmbientThemeSource`                                     | appearance | Music albumArt 等           |
| `ThemePreferenceModel`                                   | appearance | 组合上述三者                |
| `PageMetadata`                                           | meta       | 无 DOM                      |
| `EmptyStateModel`                                        | content    |                             |
| `UserAction`                                             | content    | 含 `intent`                 |
| `SyncState` / `SyncErrorPresentation`                    | sync       |                             |
| `FeedbackMessage` / `OverlayState` / `OverlayKind`       | feedback   |                             |
| `NavItemModel` / `NavGroupModel` / `NavPresentation`     | nav        | `href` web-only             |
| `SegControlModel` / `SegOption`                          | nav        |                             |
| `InsightSection` / `RecommendationDisplay`               | content    | 展示 only，无 scoring       |
| `FinanceBillDueSchema` / `LifeEventSchema` / `LifeEvent` | events     | **Zod runtime**；I-P1.5 ✅ |
| `LifeEventEnvelopeSchema` / `LifeEventStatusSchema` / `parseLifeEvent` | events | **Zod runtime**；行级 envelope |

### events 模块（I-P1.5，Zod runtime）

Module：`@life-os/contracts/events` — **唯一允许 value import 的子模块**（用于 schema 校验）。

```typescript
// finance.bill_due — expected_occurrences (card_bill) → life_events outbox
FinanceBillDueSchema
LifeEventSchema // discriminatedUnion('type', …)
LifeEvent
LifeEventEnvelopeSchema // 行级 envelope（对齐 life_events 表）
LifeEventStatusSchema
parseLifeEvent(row) // 两段式解析
```

远程 DB：`life_events` 表 migration `20260708000000` **已 apply**（见 [`SUPABASE.md`](./SUPABASE.md)）；Planner 消费端 `lifeEventsInbox.js` ✅。

### 不 export（future / docs only）

见 [`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md)：`WidgetSnapshot`、`LiveActivitySession`、`PlaybackState`、`SecurityCapability` 等。

---

## Type definitions

### Appearance — 三层分离

Module：`@life-os/contracts/appearance`（**不要**命名为 `theme`）。

```typescript
type ColorSchemePreference = 'light' | 'dark' | 'system'
type BrandThemeID = 'planner' | 'fitness' | 'finance' | 'music'
type AmbientThemeSource = 'none' | 'albumArt' | 'coverMedia' | 'focusMode'
type ThemePreferenceModel = {
  colorScheme: ColorSchemePreference
  brand: BrandThemeID
  ambient: AmbientThemeSource
}
```

**Web adapter**（`@life-os/platform-web`）：`system` ↔ runtime `auto`；P0 不迁移 storage keys。

| contracts | web runtime |
| --------- | ----------- |
| `light`   | `light`     |
| `dark`    | `dark`      |
| `system`  | `auto`      |

### Navigation

```typescript
type NavItemModel = {
  id: string
  label: string
  icon: string
  href?: string // web-only
  routeKind?: 'tab' | 'stack' | 'modal' | 'external'
}
type NavGroupModel = { id: string; label?: string; items: NavItemModel[] }
type NavPresentation = 'tabBar' | 'sidebar' | 'moreSheet'
```

Native 用 `LifeOSRouteID`，不依赖 pathname。

### UserAction

```typescript
type UserActionIntent =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'retry'
  | 'dismiss'
type UserAction = { id: string; label: string; intent?: UserActionIntent }
```

### Page metadata / Empty state / Sync / Feedback

```typescript
type PageMetadata = { appId: BrandThemeID; title: string; locale?: string }

type EmptyStateModel = {
  title: string
  hint?: string
  icon?: string
  variant?: 'default' | 'rich'
  action?: UserAction
}

type SyncState = 'idle' | 'syncing' | 'synced' | 'pending' | 'error'
type SyncErrorPresentation = {
  message: string
  recoverable: boolean
  recoveryAction?: UserAction
  dismissAction?: UserAction
}

type FeedbackMessage = {
  id: string
  body: string
  severity?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
  action?: UserAction
}
type OverlayKind = 'modal' | 'sheet' | 'drawer' | 'popover'
type OverlayState = { kind: OverlayKind; open: boolean }
```

### Segmented control / Insights

```typescript
type SegControlModel = {
  value: string
  options: SegOption[]
  mode: 'single' | 'multi'
}
type InsightSection = {
  kind: 'risk' | 'suggestion' | 'anomaly' | 'info'
  items: string[]
}
type RecommendationDisplay = {
  title: string
  reasons: string[]
  confidenceLabel?: 'low' | 'medium' | 'high'
  source: string
}
```

**C-P1 消费方（代码）：** Planner / Fitness 通过 JSDoc + `applyDocumentMetaWeb`；Portal WIP 使用 `CommandPalette`；Finance 用 `@life-os/finance-enrichment-contract`；Music **未**依赖本包。

---

## Dependency reminder

```
contracts      ← 不 import theme, platform-web, apps
platform-web   ← contracts (types) + theme
theme          ← 不 import contracts
```

---

## 附录：Web Presentation Map

> contracts → web CSS/组件映射；**不**迁移 shared UI 组件。

### EmptyStateModel

| Field            | Web                                    |
| ---------------- | -------------------------------------- |
| title, hint      | `.empty`, `.empty-state`, `.lib-empty` |
| action (primary) | `.btn-primary`                         |
| variant rich     | `.empty-state--rich`（Music）          |

### SyncErrorPresentation

| Field          | Web                 |
| -------------- | ------------------- |
| message        | `.banner`           |
| recoveryAction | `intent: 'retry'`   |
| dismissAction  | `intent: 'dismiss'` |

Planner/Fitness：`syncErrorPresentation.js` 本地 adapter；**不**迁 SyncErrorBanner。

### NavItemModel

| Field | Web            | Native          |
| ----- | -------------- | --------------- |
| id    | tab matching   | `LifeOSRouteID` |
| href  | router / `<a>` | omit            |
| icon  | Lucide         | SF Symbol       |

### UserAction.intent → buttons

| intent      | Web              | SwiftUI              |
| ----------- | ---------------- | -------------------- |
| primary     | `.btn-primary`   | `.borderedProminent` |
| secondary   | `.btn-secondary` | `.bordered`          |
| destructive | `.btn-danger`    | destructive          |
| dismiss     | `.btn-ghost`     | cancel               |

### ThemePreferenceModel → Web

| Field       | Web                                                       |
| ----------- | --------------------------------------------------------- |
| colorScheme | `data-theme` via `system`→`auto` adapter                  |
| ambient     | Music `--track-accent`；Fitness cover — **≠** colorScheme |

### SegControlModel

`.seg`, `.seg-scroll` — IME guard 见 [`INPUT_IME.md`](./INPUT_IME.md)（web-only）。

---

_2026-07-08：合并原 CONTRACTS_P0 + UI_CONTRACTS；补充 events（Zod）；与 `packages/contracts/src/` 对齐。_
