# Life OS Roadmap（平台与互通路线图）

> 本文档是 Life OS 核心演进的全局路线图，融合了此前的 **Platform (C主线)** 与 **Integration (I主线)** 规划。
> **最后更新：** 2026-07-08（对照代码 + 远程 Supabase 核实完成度）

## 完成度总览（2026-07-08 核实）

| 阶段                   | 状态                                | 摘要                                                                                        |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| **I-P0** 统一身份      | 🟡 **已落地，SSO 待验收**           | 远程 DB 已有 `core_profiles`；四站 + Portal 代码均接 `coreIdentity` + `setupCrossDomainSSO` |
| **I-P1** Portal        | 🟡 **本地代码就绪，未上线**         | `apps/portal` 存在（未 commit）；无 Netlify 站 / 无 `home.kenos.space` redirect             |
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

### 🟡 I-P1: 统一入口 (Portal) — _本地代码就绪，未上线_

**URL 规划：** `https://home.kenos.space`

| 子项                        | 状态    | 证据                                                          |
| --------------------------- | ------- | ------------------------------------------------------------- |
| `apps/portal` SvelteKit App | 🟡 WIP  | Launcher UI + Glassmorphism 卡片 + CommandPalette             |
| SSO / coreIdentity 集成     | ✅ 代码 | `setupCrossDomainSSO` + `createCoreIdentityHandler('portal')` |
| Git / monorepo 纳入         | ❌      | `apps/portal/` 当前 **untracked**                             |
| Netlify 部署                | ❌      | 无 `netlify.toml`；[`NETLIFY.md`](./NETLIFY.md) 仍仅四站      |
| Auth redirect               | ❌      | Supabase allow list **无** `home.kenos.space`                 |
| Portal 内登录               | ❌      | 未登录时跳转 Finance 登录（无独立 Auth UI）                   |

**上线 checklist：** commit portal → 建 `homeos-ken` Netlify 站 → DNS `home.kenos.space` → 追加 auth redirect → 扩 `core_user_app_settings.app_id` check 含 `portal`

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

| App          | contracts        | platform-web              | 备注                                                               |
| ------------ | ---------------- | ------------------------- | ------------------------------------------------------------------ |
| Planner      | ✅ JSDoc mirrors | ✅ `applyDocumentMetaWeb` | 试点完成                                                           |
| Fitness      | ✅ JSDoc mirrors | ✅ `applyDocumentMetaWeb` | 试点完成                                                           |
| Finance      | ❌               | ❌                        | 使用 `@life-os/finance-enrichment-contract`（purchase enrichment） |
| Music        | ❌               | ❌                        | 仅 `@life-os/sync` + `@life-os/theme`                              |
| Portal (WIP) | ✅ dep           | ✅ `CommandPalette`       | 未纳入 CI build matrix                                             |

**待办：**

- Finance：将业务事件定义迁入 `@life-os/contracts/events`（Zod），与 I-P1.5 对齐
- Music：规划 nav / feedback / sync error 契约接入

---

## 本地开发与运维指引

- 身份集成测试：`./scripts/verify-life-os-identity-p0.sh`
- Supabase 迁移与远程 SQL：[`SUPABASE.md`](./SUPABASE.md)
- 原生兼容性（iOS/Native）矩阵：[`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md)
- 不允许抽象（Do-not-abstract）名单见旧档或架构评审（各 App 特有的核心引擎绝不外提）。

_历史细分阶段文档已移至 `docs/archive/LIFEOS_PLATFORM.md` 与 `docs/archive/LIFEOS_INTEGRATION.md`_
