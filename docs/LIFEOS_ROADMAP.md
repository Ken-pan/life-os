# Life OS Roadmap（平台与互通路线图）

> 本文档是 Life OS 核心演进的全局路线图，融合了此前的 **Platform (C主线)** 与 **Integration (I主线)** 规划。
> **最后更新：** 2026-07-08（对照代码 + 远程 Supabase 核实完成度；补充 C-P2 提取候选审计）

## 完成度总览（2026-07-08 核实）

| 阶段                   | 状态                                | 摘要                                                                                        |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| **I-P0** 统一身份      | 🟡 **已落地，SSO 待验收**           | 远程 DB 已有 `core_profiles`；四站 + Portal 代码均接 `coreIdentity` + `setupCrossDomainSSO` |
| **I-P1** Portal        | 🟡 **Netlify 已部署，DNS 配置中**   | `portal-ken` 已链 `Ken-pan/life-os`；`portal.kenos.space` CNAME → `portal-ken.netlify.app`  |
| **I-P1.5** 事件中心    | 🟡 **Outbox 已 deploy，消费端已做** | 远程 `life_events` ✅ + 触发器 smoke ✅；Planner inbox processor ✅                         |
| **I-P2** 跨应用智能    | ⏸️ **搁置**                         | —                                                                                           |
| **C-P0/C-P1** 契约试点 | ✅ **已完成**                       | `contracts` + `platform-web` + boundary guard；Planner/Fitness P1A/B/C                      |
| **C-P1+** 平台扩容     | 🟡 **进行中**                       | Finance enrichment-contract 保持 Finance-owned；Music contracts 已接；Wave 3 P1+ ✅         |

**图例：** ✅ 已完成 · 🟡 部分完成 / WIP · ❌ 未开始 · ⏸️ 搁置

**验收命令：**

```bash
./scripts/verify-life-os-identity-p0.sh   # I-P0
./scripts/test-outbox-trigger.sh --smoke  # I-P1.5 Outbox
npm run check:lifeos-boundaries           # C-P0 边界守卫（当前 ✅）
```

---

## 核心原则与架构边界

```text
严格边界管控 · 统一身份入口 · 事件驱动 (EDA) · 受控跨端互通
```

1. **依赖管控：** `@life-os/contracts` 是根，`apps/*` 之间**绝对禁止**互相引用。
2. **状态隔离：** 不合并各业务线核心表（如 `finance_*` 与 `planner_*`）；跨应用业务数据走 `core_*` 或 `life_events`。
3. **SSO 身份：** 统一使用 `auth.uid()`，通过跨子域 Cookie 保证多站点单点登录体验。

### Package 依赖方向 (Hard Rule)

| Package        | 可依赖                                                      | 不可依赖                                     |
| -------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `contracts`    | _nothing_                                                   | `theme`, `platform-web`, `apps`, `sync` impl |
| `theme`        | 内部                                                        | `contracts`, `platform-web`, `apps`          |
| `platform-web` | `contracts`, `theme`                                        | `apps`, `domain`                             |
| `apps/*`       | `contracts`, `platform-web`, `sync`, `theme`, 允许的 shared | 其他 `apps`                                  |

_CI 执行守卫：_ `npm run check:lifeos-boundaries` ✅

---

## 阶段规划：Integration (互通主线)

### 🟡 I-P0: 统一身份 (Shared Identity) — _已落地，SSO 待验收_

| 子项                                       | 状态              | 证据                                                                                            |
| ------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| `core_profiles` + `core_user_app_settings` | ✅ 远程已建       | migration `20260707230000` 已写入 `schema_migrations`                                           |
| 四站 Auth hooks                            | ✅                | `createCoreIdentityHandler` 于 finance / fitness / planner / music                              |
| 客户端 profile 兜底                        | ✅                | `packages/sync/src/coreIdentity.js`                                                             |
| 跨子域 SSO Cookie                          | 🟡 代码有，待 E2E | `setupCrossDomainSSO`（`.kenos.space`）；**非** roadmap 原述 `@supabase/ssr cookieOptions` 方案 |
| `schema.sql` 同步                          | ❌                | `core_*` 表仅在 migration 文件，尚未 merge 进 canonical `schema.sql`                            |
| 验收脚本                                   | ✅                | `./scripts/verify-life-os-identity-p0.sh` 可通过（migration + RLS + backfill）                  |

**下一步（SSO 体验）：**

- 生产域 `.kenos.space` 跨站免登需人工 E2E 验收（Finance 登录 → Planner 免登）
- 本地 `localhost` / Netlify preview 跨站 SSO 仍有限（Cookie domain 仅在 `*.kenos.space` 生效）
- 可选：按环境变量动态配置 cookie domain，或评估 `@supabase/ssr` Server Client 方案

### 🟡 I-P1: 统一入口 (Portal) — _Netlify 已建，DNS 待配_

**URL 规划：** `https://portal.kenos.space`（Netlify：`https://portal-ken.netlify.app`）

| 子项                        | 状态    | 证据                                                                         |
| --------------------------- | ------- | ---------------------------------------------------------------------------- |
| `apps/portal` SvelteKit App | 🟡 WIP  | Launcher 2×2 网格 + PortalLauncherCard + CommandPalette + PWA manifest       |
| SSO / coreIdentity 集成     | ✅ 代码 | `setupCrossDomainSSO` + `createCoreIdentityHandler('portal')`                |
| Git / monorepo 纳入         | ✅      | `3aa963b0` 已 push `master`；Git 构建应已触发                                |
| Netlify 部署                | ✅      | `portal-ken`（`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）→ `portal.kenos.space` |
| Auth redirect               | 🟡      | Supabase allow list 需含 `portal.kenos.space/**`（Dashboard 手动）           |
| Portal 内登录               | ✅      | `PortalUnauth` 内嵌 sign in/up（`createLifeOsAuth`）                         |

**上线 checklist：** ~~commit + push portal~~ → GoDaddy `portal` CNAME → `portal-ken.netlify.app` → Supabase 加 `portal.kenos.space/**` redirect → 扩 `core_user_app_settings.app_id` check 含 `portal`

### 🟡 I-P1.5: 跨应用事件中心 (`life_events`) — _Outbox 已 deploy，Planner 消费端已落地_

**目标：** Finance 账单到期 → Planner 任务（示例链路）

| 子项                  | 状态 | 证据                                                                                       |
| --------------------- | ---- | ------------------------------------------------------------------------------------------ |
| Zod 事件契约          | ✅   | `packages/contracts/src/events.ts`（envelope + `parseLifeEvent` + `FinanceBillDueSchema`） |
| DB 表 + Outbox 触发器 | ✅   | 远程 `life_events` + `finance_bill_event_trigger` on `finance_expected_occurrences`        |
| 远程 migration        | ✅   | `20260708000000` 已写入 `schema_migrations`                                                |
| App 消费端            | ✅   | `apps/planner/src/lib/services/lifeEventsInbox.js`（poll + mark processed）                |
| 集成测试              | ✅   | `./scripts/test-outbox-trigger.sh --smoke`（含 Zod `parseLifeEvent` 断言）                 |

**架构方案（Outbox + consume）：**

1. **Zod 事件契约：** `@life-os/contracts/events` — `finance.bill_due` + 行级 envelope
2. **Transactional Outbox：** `finance_expected_occurrences` (card_bill) insert → `life_events` 同事务写入
3. **Planner inbox：** 登录/前台恢复 poll pending → `parseLifeEvent` → 幂等任务（`meta.lifeEventRef.occurrenceId`）→ `processed`

### ⏸️ I-P2: 跨应用智能 (Cross-App Intelligence)

搁置；依赖 I-P1.5 消费端落地后再探索。

---

## 阶段规划：Platform (契约与共享包主线)

### ✅ C-P0 & C-P1: 基础契约试点 — _已完成_

| 子项                                              | 状态 |
| ------------------------------------------------- | ---- |
| `@life-os/contracts` 包（7 模块 type-only）       | ✅   |
| `@life-os/platform-web` 适配器                    | ✅   |
| `npm run check:lifeos-boundaries`                 | ✅   |
| Planner P1A/B/C（appearance / meta / sync error） | ✅   |
| Fitness P1A/B/C                                   | ✅   |

### 🟡 C-P1+: 平台全面扩容 — _进行中_

| App          | contracts        | platform-web                             | 备注                                                               |
| ------------ | ---------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Planner      | ✅ JSDoc mirrors | ✅ `applyDocumentMetaWeb` + `createI18n` | 试点完成                                                           |
| Fitness      | ✅ JSDoc mirrors | ✅ `applyDocumentMetaWeb` + `createI18n` | 试点完成                                                           |
| Finance      | ❌               | ❌                                       | 使用 `@life-os/finance-enrichment-contract`（purchase enrichment） |
| Music        | ✅ JSDoc mirrors | ✅ `createI18n` + `AppBrand`             | nav/feedback/sync 契约已 mirror；nav 内容仍 app-owned              |
| Portal (WIP) | ✅ dep           | ✅ `CommandPalette`                      | 未纳入 CI build matrix                                             |

**待办：**

- Finance React 栈共享 UI（SyncErrorBanner 等）— 见 P2

### ✅ C-P2 Wave 1: 运行时去重 — _2026-07-07 完成_

依据"3+ app 重复才提取"原则，将逐字节/近逐字节重复的运行时代码收进共享包：

| 提取项                       | 收编前                                        | 现在                                                                |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| Supabase client 创建         | 5 份（4×`supabase.js` + finance `.ts`）       | `@life-os/sync` `createLifeOsSupabaseClient`；生产 URL/key 唯一定义 |
| Auth 生命周期                | 3 份 `auth.svelte.js`（仅差 appId + 回调）    | `@life-os/sync` `createLifeOsAuth`；`$state` 留 app                 |
| i18n 机制（t/lookup/locale） | 3 份 `i18n/index.js`                          | `@life-os/platform-web` `createI18n`；messages 留 app               |
| CommandPalette 出口          | `index.js` re-export `.svelte`（Node 跑不动） | 子路径出口 `@life-os/platform-web/CommandPalette.svelte`            |

注：Finance 保持 env 门禁语义（`productionFallback: false`，缺配置时 AuthGate 显示 config-missing）。

### ✅ C-P2 Wave 1.5: 高风险共享层 — _2026-07-07 完成_

| 项                                     | 结果                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Finance AuthGate → `createLifeOsAuth`  | lifecycle effect 收编；相位机/乐观缓存/device-limit 语义不变；新增 `@life-os/sync` 包测试                                     |
| Toast store + 组件                     | `platform-web` `./svelte/toast`（组件）+ `./svelte/toast-store`（runes store）；Music 自定义时长策略经 `resolveDuration` 注入 |
| 事件契约 RFC                           | [`LIFEOS_EVENTS_RFC.md`](./LIFEOS_EVENTS_RFC.md) + `contracts/events` runtime（envelope + `parseLifeEvent`）                  |
| Finance `themePreference` → 共享 store | `useThemePreference` 改用 `createThemePreferenceStoreWeb`；`fos-theme` 存储键不迁移                                           |
| backup 骨架                            | `platform-web` `./backup`（envelope/下载/解析）+ fixtures + 回归测试；`applyState` 留 app                                     |

### ✅ C-P2 Wave 2: 组件层 — _2026-07-07 完成_

`platform-web` `./svelte/*` 子路径出口（组件源码直发，Vite 编译）：

| 出口                      | 内容                                                          | 消费方                              |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `./svelte/head`           | `DocumentHead.svelte`（4 份收 1）                             | planner / fitness / music / portal  |
| `./svelte/icon`           | `Icon.svelte` — registry 走 context 注入，**图标集留 app**    | planner / fitness / music           |
| `./svelte/sync-error`     | `SyncErrorBanner.svelte` + `./sync-error` presentation        | planner / fitness / music           |
| `./svelte/navigation`     | `BackButton.svelte`（label 由 app 注入）                      | fitness（wrapper）                  |
| `./svelte/settings/*`     | 11 个叶子组件（Row/Toggle/Segment/Section/SyncBlock…）        | planner / fitness（组合组件留 app） |
| `./svelte/toast{,-store}` | Toast 组件 + runes store（Wave 1.5）                          | planner / fitness / music           |
| `./navigation`（types）   | `WebNavItem` / `WebNavGroup` — 只对齐类型，**nav 内容留 app** | planner / fitness / music           |
| `./backup`                | 备份 envelope/下载/解析骨架（Wave 1.5）                       | planner / fitness                   |

### ✅ C-P2 Wave 2.5: 品牌标识 — _2026-07-08 完成_

| 项                                         | 落点                                                                         | 消费方                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------ |
| 品牌元数据（wordmark、asset 路径、尺寸表） | `@life-os/theme/brand` `getLifeOsBrand` / `getLifeOsBrandMarkSize`           | 全站                                       |
| Svelte 组合件                              | `platform-web/svelte/brand`（`AppBrand` / `BrandMark` / `AppBrandWordmark`） | planner / fitness / music AppBar & SideNav |
| React 薄包装                               | `apps/finance/src/components/AppBrand.tsx`                                   | Finance（无法直接 import `.svelte`）       |
| Portal 局部                                | ✅ `AppBrand appId="portal"`（Wave 3 P0）                                    | portal AppBar                              |

**原则：** 图标文件仍放各 app `static/`（Finance 用 `/assets/brand` 前缀）；共享层只统一 **命名与 markup 契约**，不搬二进制资产。

### ✅ C-P2 Wave 3 P0 — _2026-07-08 完成_

| 提取项              | 落点                                                      | 消费方                                          |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| **PortraitGate**    | `platform-web/svelte/portrait-gate`                       | planner / fitness（Finance 保留 React 薄包装）  |
| **localCache**      | `platform-web/local-cache` `createLocalCache({ prefix })` | planner `planos_cache` / finance `fos_cache`    |
| **Portal AppBrand** | `AppBrand appId="portal"`                                 | portal AppBar；补齐 `static/brand-circle-*.png` |

### ✅ C-P2 Wave 3 P1+ — _2026-07-08 完成_

| 提取项 / 任务                  | 落点                                                        | 消费方 / 备注                                |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| **MobileMoreSheet**            | `platform-web/svelte/navigation/MobileMoreSheet`            | planner / music；`nav.js` 内容仍留 app       |
| **Portal auth 生命周期**       | `apps/portal/src/lib/auth.svelte.js` → `createLifeOsAuth`   | portal `+layout.svelte`                      |
| **Music contracts 接入**       | JSDoc mirror `@life-os/contracts/nav` + `feedback` + `sync` | `nav.js` / `ui.svelte.js` / `syncNotify.js`  |
| **events RFC envelope**        | `packages/contracts/src/events.ts`                          | `LifeEventEnvelopeSchema` + `parseLifeEvent` |
| **Finance → contracts/events** | smoke Zod 校验 + README 对齐                                | enrichment 包保持 Finance-owned              |
| **Planner 消费 life_events**   | `apps/planner/src/lib/services/lifeEventsInbox.js`          | poll + 幂等任务 + mark processed             |

### 🟡 C-P2 Wave 3 P2+ — _剩余候选_

依据「**3+ app 逐字节重复才提取**」+ 双栈（Svelte / React）成本，按优先级排列：

#### P0 — ~~低成本、重复明确~~ ✅ 2026-07-08 已完成（见上表 Wave 3 P0）

| 候选                  | 状态                                   |
| --------------------- | -------------------------------------- |
| ~~PortraitGate~~      | ✅ `platform-web/svelte/portrait-gate` |
| ~~localCache~~        | ✅ `platform-web/local-cache`          |
| ~~Portal → AppBrand~~ | ✅ portal `PortalAppBar`               |

#### P1 — ~~中等收益（Wave 3 后半）~~ ✅ 2026-07-08 已完成（见上表 Wave 3 P1+）

| 候选                           | 状态 |
| ------------------------------ | ---- |
| ~~MobileMoreSheet~~            | ✅   |
| ~~Portal auth 生命周期~~       | ✅   |
| ~~Music contracts 接入~~       | ✅   |
| ~~Finance → contracts/events~~ | ✅   |
| ~~events RFC envelope~~        | ✅   |
| ~~Planner 消费 life_events~~   | ✅   |

#### P2 — 需新包或栈决策（暂缓，记债）

| 候选                                        | 阻塞                          | 方向                                                                                                                |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Finance SyncErrorBanner / Settings 叶子** | React 栈无共享 UI 包          | 未来 `@life-os/ui-react` 镜像 `platform-web/svelte/*`；短期可共用 `createSyncErrorPresentation` 逻辑、markup 留 app |
| **Finance i18n**                            | React Context vs `createI18n` | `platform-web` 抽 `createI18nCore` 或 Finance 保持独立 translate                                                    |
| **Finance backup**                          | 无 settings 备份流            | 若加导出，复用 `platform-web/backup` envelope（planner/fitness 已用）                                               |
| **schema.sql ↔ migrations**                 | 文档/运维债                   | `core_*` / `life_events` merge 进 canonical `schema.sql` 快照（SUPABASE.md 已部分记录）                             |

#### P3 — 分化大，明确暂缓

| 候选                          | 原因                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `sw.js` / `serviceWorker`     | planner 202 行 / fitness 210 行 / music 350 行，缓存策略与 precache 分化 |
| `BottomNav` / `AppBar` 整组件 | 仅 2–3 app；工具栏与 nav 内容强绑定业务                                  |
| `SideNav` / `ListSidebar`     | 结构相似但列表/分组语义不同                                              |
| `@life-os/domain`             | P1+ 占位；无纯函数重复达提取阈值                                         |
| `@life-os/ui-svelte` 聚合包   | Wave 2 已用子路径直出组件；暂不需要再包一层                              |

#### 提取决策矩阵（速查）

```text
重复 ≥3 app 且逻辑相同     → 提取到 sync / platform-web / theme
重复 2 app 且 envelope 同构 → 参数化工厂（localCache、backup 已示范）
Svelte 组件 + Finance React → theme/brand.js 共享数据 + 各栈薄壳；或等 ui-react
业务表 / nav 内容 / sync 引擎 → 永不提取（app-only）
跨 app 业务联动             → life_events + contracts（Integration），不是 UI 包
```

**已确认不提取（do-not-abstract）：** 各 app `sync.js` 引擎（表语义不同）、`nav.js` 内容、`state.svelte.js`、`iconRegistry.js` 图标集（仅共享 `ICON_REGISTRY_CONTEXT_KEY`）、`supabaseTables.js`（表名即业务边界）、recommendation scoring、各 app 行级 UI（TaskRow / TxnRow / TrackRow）。

#### 已共享但无需再动的 app 薄包装（勿误提取）

| App 文件                            | 实际来源                                    | 说明                                                   |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `*/lib/supabase.{js,ts}`            | `createLifeOsSupabaseClient`（内含 SSO）    | 仅 env 选项差异（Finance `productionFallback: false`） |
| `*/lib/syncNotify.{js,ts}`          | `createSyncNotify` + app i18n `formatError` | 文案必须留 app                                         |
| `*/lib/scrollLock.js`（planner）    | re-export `@life-os/theme`                  | 可删本地文件改直 import（可选清理）                    |
| `music/lib/utils/createImeGuard.js` | re-export `@life-os/theme`                  | 同上                                                   |
| `*/lib/backup.js`                   | `platform-web/backup` + app `applyState`    | 数据组装留 app                                         |

---

## 阶段规划：Design System (设计系统主线)

**战略（2026-07-08 定）：** token-first / code-first / visual-test-first。
Design decisions 归 `packages/design-tokens`（DTCG-like JSON 真源）→ 生成 `packages/theme/src/generated/*.css` → apps / design-catalog 消费。
`apps/design-catalog` 永远只是 thin preview（inspection surface），不拥有 design decision。
Storybook-first / Figma-first 已明确否决（现阶段）。

### ✅ D-P0: Design Catalog thin preview — _2026-07-08 完成_

- `apps/design-catalog`（Vite + Svelte 5，端口 5190）：tokens / buttons / segments / settings / brand / navigation / icon / feedback / toast showcases
- Playwright smoke：`npm run test:design-catalog`（desktop + mobile 矩阵）

### ✅ D-P1: Design Tokens Source of Truth — _2026-07-08 完成_

| 子项                                                                       | 状态 |
| -------------------------------------------------------------------------- | ---- |
| `packages/design-tokens`（primitive / semantic / brands JSON）             | ✅   |
| `npm run build:tokens` → `packages/theme/src/generated/brands/*.css`       | ✅   |
| `npm run validate:tokens`（refs / 契约 / 重复 key / drift / staleness）    | ✅   |
| 手写 `packages/theme/src/brands/*.css` 删除，`app-themes.css` 改 generated | ✅   |
| 生成 CSS 与原手写 declaration-identical（零视觉回归）                      | ✅   |

规则：`packages/theme/src/generated/**` 禁止手改；品牌值只改 `tokens/brands/*.json`。
`packages/theme/src/tokens.css`（结构层）仍 authored，validate 做 drift 校验，D-P2 再切。

### ✅ D-P2: 清理 app `:root` 品牌双轨 — _2026-07-08 完成_

| 子项                                                                                                       | 状态      |
| ---------------------------------------------------------------------------------------------------------- | --------- |
| 四端 `<html>` 加静态 `data-app`；生成层输出 `[data-mode]` + `[data-theme]` 双选择器                        | ✅        |
| 四端删除 `:root` 手写品牌色，改 `@import '@life-os/theme/brands/<app>.css'`                                | ✅        |
| token 层补全缺口（fitness 完整亮色、planner/music/finance dark sidebar 等）                                | ✅        |
| App 专属扩展（shadows / 领域语义 / 图表 / z-index / chrome）留在 app 层                                    | ✅        |
| Ad-hoc 浏览器计算值回归：未发现明确品牌 token 回归（无 committed baseline/script；505 数字不可作正式验收） | ✅ ad-hoc |

**注意：** app 品牌色只能改 `packages/design-tokens/tokens/brands/*.json`，app CSS 只留 app 专属扩展。
**遗留（并入 D-P3 前置）：** `packages/theme/src/tokens.css` 结构层仍 authored（validate 有 drift 守卫），待切 generated。

### ✅ D-P3: Shared component tokenization — _2026-07-08 完成（P3a + P3b）_

**范围：** 所有适合共享的 platform-web 组件 + 对应 theme CSS primitive（不是 production app 页面迁移）。

#### P3a — Card primitive

| 子项                                                        | 状态 |
| ----------------------------------------------------------- | ---- |
| `tokens/component.json` → `generated/component.css`         | ✅   |
| `@life-os/platform-web/svelte/card` + co-located `card.css` | ✅   |
| design-catalog Cards showcase + smoke（4 app × 2 mode）     | ✅   |

#### P3b — Settings / Toast / Navigation / Banner

| 子项                                                                      | 状态 |
| ------------------------------------------------------------------------- | ---- |
| 扩展 `control.*` / `feedback.*` / `navigation.*` component tokens         | ✅   |
| Settings block/row → `--control-*`；补齐 `settings-block-toggle`          | ✅   |
| Toast + Banner → `--feedback-*`（含 `.toast--info`、`.banner.info`）      | ✅   |
| Nav tab / mobile-more → `--navigation-*`；backdrop → `--overlay-backdrop` | ✅   |
| `BackButton` + `navigation.css`；`Toast` + `toast.css`                    | ✅   |
| `CommandPalette` backdrop → `--overlay-backdrop`                          | ✅   |

#### P3 组件覆盖矩阵（platform-web + theme 支撑）

| 组件域                             | platform-web | component tokens             | co-located CSS            | catalog               | smoke     |
| ---------------------------------- | ------------ | ---------------------------- | ------------------------- | --------------------- | --------- |
| **Card**                           | ✅ primitive | ✅ `card.*`                  | ✅ `card.css`             | ✅ cards              | ✅ 全矩阵 |
| **Settings**（11 个 Svelte）       | ✅           | 🟡 `control.*` 部分          | theme CSS                 | ✅ settings           | 🟡 单点   |
| **Toast**                          | ✅           | ✅ `feedback.*`              | ✅ `toast.css`            | ✅ toast              | 🟡 单点   |
| **Banner**（SyncErrorBanner）      | ✅           | ✅ `feedback.*`              | theme CSS                 | ✅ feedback/utilities | 🟡 单点   |
| **Navigation**（Back + MoreSheet） | ✅           | ✅ `navigation.*`            | ✅ `navigation.css`       | ✅ navigation         | 🟡 单点   |
| **Icon / Brand / DocumentHead**    | ✅           | N/A（继承 semantic）         | —                         | ✅                    | —         |
| **CommandPalette**                 | ✅（root）   | 🟡 overlay only              | scoped in Svelte          | ❌                    | ❌        |
| **PortraitGate**                   | ✅           | ❌ 仍 `--bg`/`--t1` fallback | theme `portrait-gate.css` | 🟡 utilities          | ❌        |

#### Theme-only primitives（P3c ✅）

| 域                               | CSS 位置           | component tokens     | 状态 |
| -------------------------------- | ------------------ | -------------------- | ---- |
| **Buttons**（`.btn-*`）          | `components.css`   | ✅ `button.*`        | ✅   |
| **Segments**（`.seg`）           | `seg.css`          | ✅ `segment.*`       | ✅   |
| **Toggle**（`.settings-toggle`） | `settings-ext.css` | ✅ `control.toggle*` | ✅   |

**D-P3 刻意不做：** production app 页面迁移；MusicCard / TaskCard 等业务 card；Storybook；screenshot baseline commit（D-P5）。

**遗留 → 后续：**

- `tokens.css` 结构层仍 authored
- CommandPalette 面板未抽 component tokens（仅 backdrop ✅）；无 catalog showcase
- PortraitGate 仍用 structural `--bg`/`--t1` fallback
- app 层 `.back-btn` 边距 override（planner/fitness）仍保留
- catalog smoke 对 toast/settings 未做 4×2 矩阵（Cards 已有）；ad-hoc 截图见 `scripts/design-catalog-p3-screenshot-audit.mjs`

### ✅ D-P3c: Button / Segment / Toggle token 化 — _2026-07-08 完成_

| 子项                                                             | 状态                                                |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `button.*` / `segment.*` / `control.toggle*` in `component.json` | ✅                                                  |
| `.btn-*` / `.seg` / `.settings-toggle` 改读 component tokens     | ✅                                                  |
| ad-hoc screenshot audit script                                   | ✅ `scripts/design-catalog-p3-screenshot-audit.mjs` |

### ✅ D-P3 catalog UX fixes — _2026-07-08_

| 子项                                                                             | 状态 |
| -------------------------------------------------------------------------------- | ---- |
| `CatalogShell` 同步 `data-app`/`data-mode` 到 `<html>`                           | ✅   |
| `.catalog-doc-preview` 内联 Toast/Banner/Sheet fixture                           | ✅   |
| Button CSS fallbacks + `--critical` semantic danger tokens                       | ✅   |
| Showcase 修正（Cards btn 类、Segments app 变体、Navigation open sheet）          | ✅   |
| Settings action row affordance + destructive 示例                                | ✅   |
| Screenshot audit 增加 html theme + 视觉断言                                      | ✅   |
| P2: sheet preview `manageFocus={false}` / Sign out danger / toast action 色      | ✅   |
| Toast spacing 对齐 MD3/WCAG（48px min-h、lh 1.5、dismiss 居中、action gap 12px） | ✅   |

### D-P3 全面状态检查 — _2026-07-08_

**Merge readiness（catalog + theme 层）：PASS（待 commit）**

| 检查项                                   | 结果         | 备注                                       |
| ---------------------------------------- | ------------ | ------------------------------------------ |
| `npm run validate:tokens`                | ✅           | refs / contract / drift 全绿               |
| `npm run build -w design-catalog`        | ✅           |                                            |
| `npm run test:design-catalog`            | ✅ **42/42** | tokens 4×2、cards 4×2 + 单点 smoke         |
| `design-catalog-p3-screenshot-audit.mjs` | ✅ **64/64** | 8 showcase × 4 app × 2 mode                |
| `design-catalog-p3-visual-verify.mjs`    | ✅ **38/38** | 含 toast spacing / danger 语义 / html 同步 |
| 生产四端 app 页面迁移                    | ⛔ 未做      | D-P3 刻意边界                              |
| `apps/music/exports/**` 截图             | ⛔ 未提交    | 边界遵守                                   |

**已推送 `master`（`7491989f` 及之前）：** P1/P2/P3a/P3b/P3c。

**本地未 commit（P3 catalog UX + spacing + platform-web 小 API）：** 约 25 文件 / +483 −52 行（不含 `apps/home/**`、`apps/music/exports/**`、icon-manifest 等无关改动）。

**组件 smoke 覆盖（Playwright committed）：**

| Showcase                                                                  | 矩阵覆盖        | ad-hoc 截图 |
| ------------------------------------------------------------------------- | --------------- | ----------- |
| tokens                                                                    | ✅ 4×2          | ✅          |
| cards                                                                     | ✅ 4×2 + mobile | ✅          |
| buttons / segments / settings / navigation / feedback / toast / utilities | 🟡 单点或部分   | ✅ 全矩阵   |
| brand / icon                                                              | ❌              | ❌          |
| CommandPalette                                                            | ❌ 无 showcase  | ❌          |

**→ 可进入 D-P4：** P3 组件 token + catalog inspection 面已可信；建议 **先 commit P3 UX 批次** 再开 P4。

### ⏳ D-P4: Catalog 2.0 matrix view — _建议下一步_

**目标：** 把 catalog 从「单 showcase + URL 参数切换」升级为 **可扫视的 inspection matrix**，成为 D-P5 screenshot baseline 的前置 UI。

**现状：** `ThemeMatrix.svelte` 仅提供 app/mode/viewport 三个 `<select>`；无 grid 概览、无 state 维度、smoke 未覆盖全矩阵。

**建议范围（按优先级）：**

| 优先级  | 交付物                                 | 说明                                                                                                  |
| ------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **P4a** | Matrix 路由 `/matrix?showcase=buttons` | 单页 grid：**4 app × 2 mode** 缩略 iframe 或并排 panel；点击跳转 detail URL                           |
| **P4b** | State 维度                             | 每个 showcase 声明 `states[]`（如 buttons: default/disabled；settings: default/disabled/destructive） |
| **P4c** | Playwright smoke 扩展                  | P3 showcase 全矩阵 presence test（不必 screenshot）；对齐 P4 grid 单元                                |
| **P4d** | CommandPalette showcase                | 补 P3 矩阵缺口；overlay + 面板 token 可视化                                                           |
| **P4e** | `ThemeMatrix` token 化                 | matrix chrome 改读 theme（现为 hardcoded `#1a1a1a`）                                                  |

**刻意不做（仍属 D-P3 边界）：**

- 四端 production 页面 Card/Banner 迁移
- committed screenshot baseline（→ D-P5）
- Storybook / Figma-first

**验收标准：**

- 任一 P3 showcase 可在 matrix 页一眼看到 4×2 品牌差异
- `npm run test:design-catalog` ≥ 80 tests（矩阵 presence，非 pixel diff）
- README + ROADMAP 更新 matrix URL 与 state 注册方式

### ⏳ D-P5+: 后续阶段（按序）

| 阶段 | 内容                                                          | 触发条件                                |
| ---- | ------------------------------------------------------------- | --------------------------------------- |
| D-P4 | Catalog 2.0 matrix view（state × app × mode × viewport）      | D-P3 完成 ✅；**建议先 commit UX 批次** |
| D-P5 | Playwright `toHaveScreenshot` visual regression baseline      | D-P4 完成                               |
| D-P6 | a11y gates（contrast / focus / target size / reduced motion） | D-P5 完成                               |
| D-P7 | Figma variables mirror（code JSON 仍为真源）                  | 需要设计侧协作                          |
| D-P8 | Storybook / Chromatic                                         | 仅当团队协作压力出现                    |

---

## 本地开发与运维指引

- 身份集成测试：`./scripts/verify-life-os-identity-p0.sh`
- Supabase 迁移与远程 SQL：[`SUPABASE.md`](./SUPABASE.md)
- 原生兼容性（iOS/Native）矩阵：[`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md)
- 不允许抽象（Do-not-abstract）名单见旧档或架构评审（各 App 特有的核心引擎绝不外提）。

_历史细分阶段文档已移至 `docs/archive/LIFEOS_PLATFORM.md` 与 `docs/archive/LIFEOS_INTEGRATION.md`_
