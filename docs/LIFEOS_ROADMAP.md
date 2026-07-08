# Life OS Roadmap（平台与互通路线图）

> 本文档是 Life OS 核心演进的全局路线图，融合了此前的 **Platform (C主线)** 与 **Integration (I主线)** 规划。
> **最后更新：** 2026-07-08（对照代码 + 远程 Supabase 核实完成度）

## 完成度总览（2026-07-08 核实）

| 阶段                   | 状态                                | 摘要                                                                                        |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| **I-P0** 统一身份      | 🟡 **已落地，SSO 待验收**           | 远程 DB 已有 `core_profiles`；四站 + Portal 代码均接 `coreIdentity` + `setupCrossDomainSSO` |
| **I-P1** Portal        | 🟡 **Netlify 已建，DNS 待配**       | `homeos-ken` 已链 `Ken-pan/life-os`；`home.kenos.space` DNS + auth redirect 待你配置        |
| **I-P1.5** 事件中心    | 🟡 **Outbox 已 deploy，消费端未做** | 远程 `life_events` ✅ + 触发器 smoke ✅；Planner 消费端仍缺                                 |
| **I-P2** 跨应用智能    | ⏸️ **搁置**                         | —                                                                                           |
| **C-P0/C-P1** 契约试点 | ✅ **已完成**                       | `contracts` + `platform-web` + boundary guard；Planner/Fitness P1A/B/C                      |
| **C-P1+** 平台扩容     | 🟡 **进行中**                       | Finance 仍用 `finance-enrichment-contract`；Music 未接 contracts                            |

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

**URL 规划：** `https://home.kenos.space`（回滚：`https://homeos-ken.netlify.app`）

| 子项                        | 状态    | 证据                                                                             |
| --------------------------- | ------- | -------------------------------------------------------------------------------- |
| `apps/portal` SvelteKit App | 🟡 WIP  | Launcher UI + shell/settings-block 卡片 + CommandPalette                         |
| SSO / coreIdentity 集成     | ✅ 代码 | `setupCrossDomainSSO` + `createCoreIdentityHandler('portal')`                    |
| Git / monorepo 纳入         | ✅      | `3aa963b0` 已 push `master`；Git 构建应已触发                                    |
| Netlify 部署                | 🟡      | ✅ `homeos-ken`（`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）；env 已从 fitness 克隆 |
| Auth redirect               | ❌      | Supabase allow list **无** `home.kenos.space`                                    |
| Portal 内登录               | ❌      | 未登录时跳转 Finance 登录（无独立 Auth UI）                                      |

**上线 checklist：** ~~commit + push portal~~ → GoDaddy `home` CNAME → `homeos-ken.netlify.app` → 追加 auth redirect → 扩 `core_user_app_settings.app_id` check 含 `portal`

### 🟡 I-P1.5: 跨应用事件中心 (`life_events`) — _Outbox 已 deploy，消费端未做_

**目标：** Finance 账单到期 → Planner 任务（示例链路）

| 子项                  | 状态   | 证据                                                                                |
| --------------------- | ------ | ----------------------------------------------------------------------------------- |
| Zod 事件契约          | 🟡 WIP | `packages/contracts/src/events.ts`（`FinanceBillDueSchema`）                        |
| DB 表 + Outbox 触发器 | ✅     | 远程 `life_events` + `finance_bill_event_trigger` on `finance_expected_occurrences` |
| 远程 migration        | ✅     | `20260708000000` 已写入 `schema_migrations`                                         |
| App 消费端            | ❌     | 全 repo 无 `life_events` 查询 / Planner 任务生成逻辑                                |
| 集成测试              | ✅     | `./scripts/test-outbox-trigger.sh --smoke`（插入 card_bill → 断言 event → 清理）    |

**架构方案（Outbox 已落地，待 consume）：**

1. **Zod 事件契约：** `@life-os/contracts/events` — `finance.bill_due`
2. **Transactional Outbox：** `finance_expected_occurrences` (card_bill) insert → `life_events` 同事务写入

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
| Music        | 🟡 dep           | ✅ `createI18n`                          | 2026-07-07 接入；nav / feedback 契约仍待规划                       |
| Portal (WIP) | ✅ dep           | ✅ `CommandPalette`                      | 未纳入 CI build matrix                                             |

**待办：**

- Finance：将业务事件定义迁入 `@life-os/contracts/events`（Zod），与 I-P1.5 对齐
- Music：规划 nav / feedback / sync error 契约接入

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

| 项                                        | 结果                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Finance AuthGate → `createLifeOsAuth`     | lifecycle effect 收编；相位机/乐观缓存/device-limit 语义不变；新增 `@life-os/sync` 包测试 |
| Toast store + 组件                        | `platform-web` `./svelte/toast`（组件）+ `./svelte/toast-store`（runes store）；Music 自定义时长策略经 `resolveDuration` 注入 |
| 事件契约 RFC                              | [`LIFEOS_EVENTS_RFC.md`](./LIFEOS_EVENTS_RFC.md)（taxonomy/版本策略/outbox 兼容/消费示例）；**未接 runtime** |
| Finance `themePreference` → 共享 store    | `useThemePreference` 改用 `createThemePreferenceStoreWeb`；`fos-theme` 存储键不迁移        |
| backup 骨架                               | `platform-web` `./backup`（envelope/下载/解析）+ fixtures + 回归测试；`applyState` 留 app  |

### ✅ C-P2 Wave 2: 组件层 — _2026-07-07 完成_

`platform-web` `./svelte/*` 子路径出口（组件源码直发，Vite 编译）：

| 出口                          | 内容                                                         | 消费方                              |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| `./svelte/head`               | `DocumentHead.svelte`（4 份收 1）                            | planner / fitness / music / portal  |
| `./svelte/icon`               | `Icon.svelte` — registry 走 context 注入，**图标集留 app**   | planner / fitness / music           |
| `./svelte/sync-error`         | `SyncErrorBanner.svelte` + `./sync-error` presentation       | planner / fitness / music           |
| `./svelte/navigation`         | `BackButton.svelte`（label 由 app 注入）                     | fitness（wrapper）                  |
| `./svelte/settings/*`         | 11 个叶子组件（Row/Toggle/Segment/Section/SyncBlock…）      | planner / fitness（组合组件留 app） |
| `./svelte/toast{,-store}`     | Toast 组件 + runes store（Wave 1.5）                         | planner / fitness / music           |
| `./navigation`（types）       | `WebNavItem` / `WebNavGroup` — 只对齐类型，**nav 内容留 app**| planner / fitness / music           |
| `./backup`                    | 备份 envelope/下载/解析骨架（Wave 1.5）                      | planner / fitness                   |

### 🟡 C-P2 Wave 3: 剩余候选 — _未开始_

1. `PortraitGate.svelte`（planner/fitness 2 份，逻辑样式已全在 theme，仅剩壳）
2. `MobileMoreSheet.svelte`（planner/music diff 仅 12 行）
3. `localCache`（planner js / finance ts 同概念异实现）
4. Music nav / feedback **contracts** 类型接入（C-P1+ 待办）
5. `swRegister` / `serviceWorker` — 分化大，**暂缓**

**不提取（do-not-abstract）：** 各 app `sync.js` 引擎（表语义不同）、`nav.js` 内容、`state.svelte.js`、`iconRegistry.js` 图标集（仅共享 context key）、`supabaseTables.js`（表名即业务边界）。

---

## 本地开发与运维指引

- 身份集成测试：`./scripts/verify-life-os-identity-p0.sh`
- Supabase 迁移与远程 SQL：[`SUPABASE.md`](./SUPABASE.md)
- 原生兼容性（iOS/Native）矩阵：[`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md)
- 不允许抽象（Do-not-abstract）名单见旧档或架构评审（各 App 特有的核心引擎绝不外提）。

_历史细分阶段文档已移至 `docs/archive/LIFEOS_PLATFORM.md` 与 `docs/archive/LIFEOS_INTEGRATION.md`_
