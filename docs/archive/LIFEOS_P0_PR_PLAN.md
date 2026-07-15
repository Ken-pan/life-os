# LifeOS P0 PR Plan

> Shared platform extraction — **P0 only**
> **第一轮不迁移任何 app**（含 SyncErrorBanner）
> PR 5（First app pilot）= **P1，不进 P0**

---

## PR 总览

| PR       | 名称                               | P0 做？         | 备注                    |
| -------- | ---------------------------------- | --------------- | ----------------------- |
| **PR 1** | Boundary + Native Readiness docs   | **马上做**      | 只写 docs，风险最低     |
| **PR 2** | package scaffold + boundary guard  | **做，很薄**    | 不定义真实产品 contracts |
| **PR 3** | Appearance + metadata contracts    | **做**          | `appearance` module；不叫 theme |
| **PR 4** | Feedback / Nav / Content contracts | **做**          | 不迁组件                |
| **PR 5** | First app pilot                    | **P1，不进 P0** | 建议 Fitness 或 Planner |

**依赖顺序**：PR 1 → PR 2 → PR 3 → PR 4（PR 3/4 可同 sprint，但 PR 2 必须先有 package 骨架）

---

## P0 completion status

As of 2026-07-07, P0 PR 1-4 scope is implemented locally:

- PR 1 docs and shared-platform index are in `docs/`.
- PR 2 package scaffold and boundary guard are in place.
- PR 3 appearance/meta contracts and thin platform-web adapters are in place.
- PR 4 nav/content/sync/feedback contracts are in place.

P1 has now started with Planner and Fitness pilots; see [`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md). P1A, P1B, and P1C are implemented locally in both pilot apps. Next expansion beyond these pilots requires a separate approval and plan.

---

## PR 1: Boundary + Native Readiness docs

| 项                    | 内容                                                                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**             | 文档；零 runtime                                                                                                                                                                                                                                                                                |
| **Files touched**     | `docs/README.md`, `docs/LIFEOS_SHARED_BOUNDARIES.md`, `docs/LIFEOS_NATIVE_READINESS.md`, `docs/LIFEOS_CONTRACTS_P0.md`, `docs/LIFEOS_P0_PR_PLAN.md`, `docs/LIFEOS_UI_CONTRACTS.md`, `packages/theme/DESIGN_SYSTEM.md`（四端 + 依赖方向 + 链到 boundaries） |
| **Files NOT touched** | `apps/**`, `packages/theme/src/**`, `supabase/**`                                                                                                                                                                                                                                               |
| **Must include**      | ① 架构图 **contracts 为根**，theme 不指向 contracts ② 依赖方向表 ③ API 四分类 ④ P0 export 白名单 ⑤ PR 5 明确 P1                                                                                                                                                                                 |
| **Acceptance**        | Reviewer 可判定任意 API 的 tag；无 theme→contracts 误解                                                                                                                                                                                                                                         |
| **Rollback**          | Revert doc commit                                                                                                                                                                                                                                                                               |
| **Test**              | 文档审查；如 worktree 有无关改动，不强制跑 full app checks，仅记录建议命令 `npm run check`                                                                                                                                                                                                       |

---

## PR 2: package scaffold + boundary guard only

| 项                    | 内容                                                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**             | 新建 `packages/contracts`（`.d.ts` only shell）+ `packages/platform-web`（empty/thin shell）；package README；workspace registration；dependency direction docs；boundary check script requirement                                                                                 |
| **Allowed**           | `package.json`, README, empty `src/index.d.ts`, empty `src/index.js` only if runtime entry is needed by package exports; `scripts/check-lifeos-boundaries.mjs`; root npm script `check:lifeos-boundaries`                                                                           |
| **Not allowed**       | 定义真实产品 contracts；迁移 app imports；实现 app-facing runtime behavior；迁移 theme JS；创建 ui/domain/native packages                                                                                                                                                           |
| **Files NOT touched** | 所有 `apps/**`；`supabase/**`；不删旧组件                                                                                                                                                                                                                                          |
| **Dependency rule**   | contracts: nothing; platform-web: contracts + theme; theme: no contracts                                                                                                                                                                                                           |
| **Type-only rule**    | 因 `@life-os/contracts` 为 `.d.ts only`，TS 必须 `import type { ... } from '@life-os/contracts/...'`；JS/Svelte 只能用 JSDoc `/** @typedef {import('@life-os/contracts/...').SomeType} SomeType */`；禁止 runtime value import |
| **Boundary guard**    | 新增 `scripts/check-lifeos-boundaries.mjs`：contracts 不 import workspace package；theme 不 import contracts/platform-web/apps；platform-web 只可 import `@life-os/contracts` 与 `@life-os/theme` 且不可 import apps/ui/domain；app code 不可 value-import contracts                  |
| **Acceptance**        | boundary script 可独立运行；unsafe contracts value import 会失败；contracts 零 browser import；四 app build 行为不变                                                                                                                                                              |
| **Rollback**          | Remove packages + boundary script                                                                                                                                                                                                                                                  |
| **Test**              | `npm run check:lifeos-boundaries`；如 worktree 有无关改动，不强制跑 full app checks，仅记录建议命令 `npm run check` / `npm run build`                                                                                                                                              |

---

## PR 3: Appearance + metadata contracts

| 项                    | 内容                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**             | `@life-os/contracts/appearance` + metadata contracts；不使用 `theme` 作为 contracts module 名称                                                                  |
| **cross-surface**     | `ColorSchemePreference`, `BrandThemeID`, `AmbientThemeSource`, `ThemePreferenceModel`, `PageMetadata`                                                           |
| **Naming**            | `appearance` = cross-surface product semantics；`@life-os/theme` 继续表示 web CSS/runtime implementation                                                        |
| **system ↔ auto**     | contracts 使用 `'system'`；web adapter 映射 `system -> auto`、`auto -> system`；P0 不迁移现有 app storage keys/values；测试必须覆盖双向映射                    |
| **web-only**          | `createThemePreferenceStoreWeb`, `applyDocumentMetaWeb`, `toWebThemePreference`, `fromWebThemePreference` in platform-web（stub or thin impl OK）                |
| **Files NOT touched** | app `state.svelte.js`, Finance `useThemePreference.ts`, Music ambient JS                                                                                         |
| **App pilot**         | **禁止**；最多 JSDoc `@typedef` 引用                                                                                                                            |
| **Acceptance**        | ambient 与 colorScheme 分离 documented；`appearance` module naming enforced；Swift mapping notes；`system <-> auto` tests documented or implemented if adapter exists |
| **Rollback**          | Revert package changes                                                                                                                                          |
| **Test**              | `npm run check:lifeos-boundaries`; platform-web unit tests if impl; recommend `npm run check` when worktree is clean                                             |

---

## PR 4: Feedback / Nav / Content contracts

| 项                    | 内容                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**             | `NavItemModel`（含 semantic `icon`, `routeKind`, optional `href`）, `NavGroupModel`, `NavPresentation`, `UserAction`+`intent`, `EmptyStateModel`, `SyncState`, `SyncErrorPresentation`, `FeedbackMessage`, `OverlayState`, `SegControlModel`, `InsightSection`, `RecommendationDisplay` |
| **Docs**              | `docs/LIFEOS_UI_CONTRACTS.md` — web CSS class map + SwiftUI mapping notes                                                                                                                                                          |
| **Files NOT touched** | 四端 SyncErrorBanner, EmptyState, nav.js 实现                                                                                                                                                                                      |
| **Recommendation**    | `RecommendationDisplay` 使用 `confidenceLabel?: 'low' \| 'medium' \| 'high'`；不 export numeric score；ranking/sorting/decision logic 仍 app-only                                                                                  |
| **Acceptance**        | Nav native 不依赖 pathname；UserAction intent 覆盖 retry/dismiss；RecommendationDisplay 无 numeric score；不迁任何组件                                                                                                             |
| **Rollback**          | Revert                                                                                                                                                                                                                             |
| **Test**              | `npm run check:lifeos-boundaries`; Manual checklist vs four apps                                                                                                                                                                    |

---

## PR 5: First app pilot（P1 — 不在 P0 范围）

| 项            | 内容                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| **When**      | P0 PR 1–4 merged + reviewer sign-off                                       |
| **Candidate** | Planner selected for first pilot                                           |
| **Scope**     | 单 app opt-in：JSDoc type mirror + `applyDocumentMetaWeb` metadata adapter |
| **Still not** | 不删旧组件；不强制四端同步迁移；不迁 SyncErrorBanner                       |

---

## Web-only vs cross-surface（P0 摘要）

| cross-surface (contracts)    | web-only (platform-web / theme) |
| ---------------------------- | ------------------------------- |
| ThemePreferenceModel         | localStorage read/write; `system <-> auto` adapter |
| PageMetadata                 | document.title, meta tags       |
| NavItemModel (id, icon, routeKind) | NavItemModel.href               |
| EmptyStateModel, UserAction  | .empty-state CSS                |
| SyncErrorPresentation        | SyncErrorBanner DOM subscribe   |
| SegControlModel              | .seg CSS, IME guard             |
| OverlayState (semantics)     | focus trap, scroll lock         |

---

## Risk summary

| Risk                                 | Level     | Mitigation                        |
| ------------------------------------ | --------- | --------------------------------- |
| theme→contracts dependency confusion | High      | PR 1 diagram + table + boundary check |
| contracts value import runtime bug   | High      | PR 2 type-only enforcement        |
| Ambient vs color scheme conflation   | Medium    | Three-field ThemePreferenceModel  |
| Premature native contracts           | Medium    | Future types docs-only            |
| App migration too early              | High      | PR 5 = P1 explicit                |
| PWA iOS regression                   | Low in P0 | No app layout changes             |

---

## Related docs

- [`LIFEOS_SHARED_BOUNDARIES.md`](./LIFEOS_SHARED_BOUNDARIES.md)
- [`LIFEOS_CONTRACTS_P0.md`](./LIFEOS_CONTRACTS_P0.md)
- [`LIFEOS_NATIVE_READINESS.md`](../LIFEOS_NATIVE_READINESS.md)
- [`LIFEOS_UI_CONTRACTS.md`](./LIFEOS_UI_CONTRACTS.md)
- [`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md)
- [`README.md`](./README.md)
