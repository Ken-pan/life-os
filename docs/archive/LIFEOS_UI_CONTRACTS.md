# LifeOS UI Contracts — Web Presentation Map

> Maps **cross-surface** contracts models to **web-only** presentation.
> P0: documentation only. No component migration.

---

## EmptyStateModel → Web

| Contract field    | Web class / component                                | App variants                                            |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `title`, `hint`   | `.empty`, `.empty-state`, `.lib-empty`               | Planner `EmptyState.svelte`; Music `.empty-state--rich` |
| `action`          | `.btn-primary` via `UserAction.intent === 'primary'` |                                                         |
| `variant: 'rich'` | `.empty-state--rich`                                 | Music import CTA                                        |

**SwiftUI (future)**：`ContentUnavailableView` + `UserAction` → `Button` role from `intent`

---

## SyncErrorPresentation → Web

| Contract field   | Web                         |
| ---------------- | --------------------------- |
| `message`        | `.banner` text              |
| `recoveryAction` | button, `intent: 'retry'`   |
| `dismissAction`  | button, `intent: 'dismiss'` |

**Planner P1 local adapter**：`apps/planner/src/lib/syncErrorPresentation.js` maps the existing app sync error reason to `SyncErrorPresentation`.
**Do not migrate** SyncErrorBanner to shared UI in P1.

---

## NavItemModel → Web vs Native

| Field       | Web                        | Native                 |
| ----------- | -------------------------- | ---------------------- |
| `id`        | active tab matching        | `LifeOSRouteID`        |
| `icon`      | Lucide/app icon mapping    | SF Symbol/app icon mapping |
| `href?`     | `<a href>` / client router | **omit**               |
| `routeKind` | sheet/modal routes         | `NavigationLink` style |

---

## UserAction.intent → Web buttons

| intent        | Web class hint   | SwiftUI (future)     |
| ------------- | ---------------- | -------------------- |
| `primary`     | `.btn-primary`   | `.borderedProminent` |
| `secondary`   | `.btn-secondary` | `.bordered`          |
| `destructive` | `.btn-danger`    | `destructive` role   |
| `retry`       | `.btn-secondary` | refresh action       |
| `dismiss`     | `.btn-ghost`     | cancel               |

---

## ThemePreferenceModel (appearance) → Web

| Field         | Web adapter (platform-web)                                          |
| ------------- | ------------------------------------------------------------------- |
| `colorScheme` | contracts `system` maps to current web runtime `auto`; then `data-theme`, `resolveTheme()` |
| `brand`       | already fixed per app                                               |
| `ambient`     | Music: `--track-accent`; Fitness: cover media — **not** colorScheme |

---

## SegControlModel → Web

| Contract          | Web CSS                                                  |
| ----------------- | -------------------------------------------------------- |
| `SegControlModel` | `.seg`, `.seg-scroll`, `.seg-chips` / app token variants |

IME guard: **web-only**, not part of Seg contract — see [`INPUT_IME.md`](../INPUT_IME.md).

---

## Related

- [`LIFEOS_CONTRACTS_P0.md`](./LIFEOS_CONTRACTS_P0.md)
- [`LIFEOS_SHARED_BOUNDARIES.md`](./LIFEOS_SHARED_BOUNDARIES.md)
