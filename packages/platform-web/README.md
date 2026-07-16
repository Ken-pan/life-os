# @life-os/platform-web

Life OS **web-only** platform layer — browser runtime adapters that connect cross-surface contracts to DOM, CSS, and storage APIs.

## P0 status

This package contains thin web-only adapters. P0 PR 3 adds appearance and page-metadata adapters. P0 PR 4 adds contracts only; presentation adapters are P1+ candidates. It does **not** migrate app imports and does **not** move existing runtime code out of `@life-os/theme`.

| Phase       | Scope                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| **P0 PR 3** | Appearance and page-metadata web adapters (theme preference store, document meta helpers) |
| **P0 PR 4** | Contracts for nav, feedback, sync error banner, and related UI models                     |
| **P1+**     | Optional presentation adapters after the first app pilot proves the shape                 |

**No app imports this package in P0.**

## P1 pilot status

`planner-os`, `fitness-os`, `music-os`, and `portal` consume shared Svelte components via
`@life-os/platform-web/svelte/*` subpath exports (C-P2 Wave 2A PR 1).

| Subpath export                                            | Component / module                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@life-os/platform-web/svelte/head`                       | `DocumentHead.svelte`                                                                                      |
| `@life-os/platform-web/svelte/icon`                       | `Icon.svelte` (registry via `setContext` + `@life-os/platform-web/icon-registry`)                          |
| `@life-os/platform-web/svelte/sync-error`                 | `SyncErrorBanner.svelte`                                                                                   |
| `@life-os/platform-web/svelte/navigation`                 | `BackButton.svelte`                                                                                        |
| `@life-os/platform-web/svelte/navigation/MobileMoreSheet` | `MobileMoreSheet.svelte`（`closeLabel` + 可选 `search` / `dotColor`）                                      |
| `@life-os/platform-web/svelte/brand/switcher`             | `AppBrandSwitcher.svelte`（六 app 侧栏切换；数据 `@life-os/theme/launcher`）                               |
| `@life-os/platform-web/svelte/brand`                      | `AppBrand.svelte` / `BrandMark.svelte` / `AppBrandWordmark.svelte`（`@life-os/theme/brand` 数据）          |
| `@life-os/platform-web/svelte/brand/mark`                 | `BrandMark.svelte` 子路径                                                                                  |
| `@life-os/platform-web/svelte/brand/wordmark`             | `AppBrandWordmark.svelte` 子路径                                                                           |
| `@life-os/platform-web/svelte/portrait-gate`              | `PortraitGate.svelte`（竖屏锁定；样式在 `@life-os/theme`）                                                 |
| `@life-os/platform-web/svelte/app-shell`                  | `LifeOsAppShell.svelte`（PLAT.SHELL 冻结契约，见 `docs/architecture/life-os-app-shell.md`）              |
| `@life-os/platform-web/svelte/app-bar`                    | `LifeOsAppBar.svelte`                                                                                       |
| `@life-os/platform-web/svelte/actions`                    | `keepPopoverInViewport()` — 浮层视口内定位 action                                                          |
| `@life-os/platform-web/svelte/explain-panel`              | `ExplainPanel.svelte`（内联展开说明；外观见 `@life-os/theme` `.explain-panel`）                            |
| `@life-os/platform-web/svelte/menu`                       | `Menu.svelte`（下拉菜单行为：开合/外点关闭/Escape/方向键循环；外观走 `@life-os/theme` `.life-os-popover`） |
| `@life-os/platform-web/svelte/feedback`                   | `ReportBugButton.svelte`                                                                                    |
| `@life-os/platform-web/svelte/card`                       | `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` / `CardMedia` / `CardActions`（Card 组合家族） |
| `@life-os/platform-web/local-cache`                       | `createLocalCache({ prefix })` — planner/finance SWR 快照                                                  |
| `@life-os/platform-web/svelte/toast`                      | `Toast.svelte`                                                                                             |
| `@life-os/platform-web/svelte/toast-store`                | `createToastStore`                                                                                         |
| `@life-os/platform-web/sync-error`                        | `createSyncErrorPresentation`                                                                              |
| `@life-os/platform-web/icon-registry`                     | `ICON_REGISTRY_CONTEXT_KEY`                                                                                |
| `@life-os/platform-web/navigation`                        | `WebNavItem` / `WebNavGroup` types                                                                         |
| `@life-os/platform-web/sw-lifecycle`                      | `registerServiceWorker({ url, shouldDeferUpdate, deferEvents })` — SW register + deferred-update lifecycle |
| `@life-os/platform-web/wake-lock`                         | `createScreenWakeLock()` — Screen Wake Lock helper (`bind` / `bindWithGestureFallback`)                    |
| `@life-os/platform-web/persistent-storage`                | `requestPersistentStorage()` — protect IndexedDB/caches from eviction                                      |
| `@life-os/platform-web/network-resume`                    | `bindNetworkResume()` — foreground + `online` resume (wraps theme viewport flush)                          |
| `@life-os/platform-web/app-badge`                         | `setAppBadgeCount()` / `clearAppBadge()` — installed-app icon badge                                        |
| `@life-os/platform-web/connectivity`                      | `isOnline()` / `bindOnlineStatus()` — lightweight online/offline events                                    |

Settings 子路径：`row`、`action-row`、`toggle`、`toggle-row`、`segment`、`button-group`、`file-button`、`stack-block`、`backup-rows`、`section`、`sync-block`。各 app 保留 `*Rows` / `*Block` 业务组合件。

`planner-os` and `fitness-os` are the current pilot consumers. They use
`applyDocumentMetaWeb` from shared `DocumentHead.svelte` while preserving the existing
SSR/static `<svelte:head>` output.

See [`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md)（C-P0/C-P1） and [`../../docs/architecture/contracts.md`](../../docs/architecture/contracts.md)（Web 映射附录）.

**Portal（I-P1 WIP）** 已使用 `CommandPalette`；Planner/Fitness 使用 `applyDocumentMetaWeb`。

See [`../../docs/architecture/pwa-background-work.md`](../../docs/architecture/pwa-background-work.md) for the cross-app background-work pattern (SW lifecycle, wake lock, foreground-resume, iOS constraints).

## Allowed dependencies

| Package              | Role                                              |
| -------------------- | ------------------------------------------------- |
| `@life-os/contracts` | Cross-surface product types (`import type` only)  |
| `@life-os/theme`     | Web CSS tokens and existing theme runtime helpers |

Must **not** depend on `@life-os/domain`, `@life-os/ui-*`, or any `apps/*` code. Enforced by `npm run check:lifeos-boundaries`.

## Install (monorepo)

```json
{
  "dependencies": {
    "@life-os/platform-web": "*"
  }
}
```

Run `npm install` at the monorepo root.
