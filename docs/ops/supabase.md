# Life OS Supabase

> **项目 ref：** `iueozzuctstwvzbcxcyh`（四站 + Portal 共用）
> **Canonical 迁移目录：** `apps/finance/supabase/`（`schema.sql` + `migrations/`）
> **路线图：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)

**最后与代码同步：** 2026-07-12（`origin/master` + 生产 MCP · migration / 代码 / gate 三层复核）

## 执行 SQL（本网络推荐路径）

直连 Postgres 5432 在本环境常不可用；使用 Management API：

```bash
# 单条查询
./scripts/supabase-sql.sh "select version from supabase_migrations.schema_migrations order by version desc limit 5;"

# 执行迁移文件
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260708000000_life_events_and_outbox.sql

# 记录已应用版本（若 API 执行后未自动写入）
./scripts/supabase-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260708000000') on conflict do nothing;"
```

凭证：`supabase login` 写入 macOS 钥匙串，或设置 `SUPABASE_ACCESS_TOKEN`。

**不要**依赖 `supabase migration up --linked` 作为唯一路径（AGENTS.md 记载在此网络会失败）。

## 生产 migration 登记（2026-07-12）

`supabase_migrations.schema_migrations`（生产 `iueozzuctstwvzbcxcyh`）当前登记：

| Version          | Name                                   | 说明                                      |
| ---------------- | -------------------------------------- | ----------------------------------------- |
| `20260710160000` | `life_os_baseline`                     | 折叠 legacy 链 + 全站 DDL（含 Planner/Paper 读路径） |
| `20260710161000` | `fitness_signup_membership`            | Auth signup 隔离 + `app_memberships`      |
| `20260710203000` | `portal_today_summary_fitness_today` | **GYMS.PORTAL.2** · Portal Fitness 卡字段 |
| `20260712200000` | `portal_today_summary_timezone_and_tombstones` | **PLNR.CORE.4** · tz + tombstone 对齐 |
| `20260713120000` | `purchase_review_associations`         | **FINC.PURCHASE.6.a** · `purchase_associations`+`purchase_decisions`+RLS+3 RPC；273 回填 proposed（2026-07-13 部署 + 生产 RPC 往返验证） |

| `20260714201817` | `home_scan_sync`                       | **HOME.SYNC.4** · `home` schema + `home.scans`（iOS RoomPlan 扫描同步；2026-07-14 部署 + REST 探针验证） |
| `20260714201818` | `home_scan_storage`                    | **HOME.SYNC.4** · 私有桶 `home-scan-photos`（机位照片 + structure.json） |

Legacy 链（`20260530171417` … `20260709201500`，43 版）已被 baseline **语义吸收**；勿重复 apply 单文件 legacy migration。

**新 schema 部署必做**：PostgREST Exposed schemas 追加名字（`GET` 后 `PATCH /v1/projects/<ref>/postgrest` 的 `db_schema` 与 `db_extra_search_path`，勿覆盖现值）。当前列表：`public,graphql_public,music,fitness,aios,home`（2026-07-14）。漏这步 = 该 schema 所有 REST 调用 PGRST106。

指纹与 rollout 细节 → [`../security/supabase-production-fingerprint.md`](../security/supabase-production-fingerprint.md)

## 平台级迁移（Integration / 共享 public 表）

| Version          | 文件                                                     | 阶段   | 远程状态（2026-07-09）                                 |
| ---------------- | -------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `20260707230000` | `migrations/20260707230000_life_os_shared_identity.sql`  | INTG.IDENTITY.0   | ✅ 已 apply                                            |
| `20260708000000` | `migrations/20260708000000_life_events_and_outbox.sql`   | INTG.EVENTS.1.5 | ✅ 已 apply（触发器挂 `finance_expected_occurrences`） |
| `20260708120000` | `migrations/20260708120000_portal_app_id_constraint.sql` | INTG.EVENTS.1   | ✅ 已 apply（`app_id` 含 `portal` + 回填）             |
| `20260708180000` | `migrations/20260708180000_home_app_id_constraint.sql`   | HOME.SSO.3   | ✅ 已 apply（`app_id` 含 `home` + 回填 + `life_os_modules`） |
| `20260708191000` | `migrations/20260708191000_portal_today_summary_music.sql` | PORT.GROWTH.4b-M | ✅ 已 apply（Music 第四卡） |
| `20260709021500` | `migrations/20260709021500_portal_today_summary_home.sql` | PORT.GROWTH.4b-H | ✅ 已 apply（Home 第五卡 · `core_user_app_settings`） |

### INTG.IDENTITY.0：`core_profiles` + `core_user_app_settings`

- 表：`public.core_profiles`、`public.core_user_app_settings`
- Auth 触发器：`auth.users` → `core_on_auth_user_created`
- 客户端：`@life-os/sync` 的 `createCoreIdentityHandler`（四站 + Portal + Home）
- 验收：`./scripts/verify-life-os-identity-p0.sh`

### INTG.EVENTS.1.5：`life_events` + Outbox 触发器

- 表：`public.life_events`（`status`: pending / processed / failed）
- 触发器：`finance_expected_occurrences` insert（`source_type = 'card_bill'`）→ `finance.bill_due` 事件
- 契约：`@life-os/contracts/events`（Zod `FinanceBillDueSchema` + `parseLifeEvent`）
- 验收：`./scripts/test-outbox-trigger.sh`（结构检查）；`./scripts/test-outbox-trigger.sh --smoke`（插入 + Zod 断言 + 清理）
- **Planner 消费端：** `src/lib/services/lifeEventsInbox.js` — poll pending → 幂等任务 → mark processed

`schema.sql` 已含 INTG.IDENTITY.0 `core_*` + INTG.EVENTS.1.5 `life_events` DDL（2026-07-08 merge）；远程需单独 apply migration。

### PORT.GROWTH.4：`portal_today_summary()` RPC

- 函数：`public.portal_today_summary()` — Planner / Finance / Fitness / Music / **Home**（`security invoker`）
- Home 字段：读 `core_user_app_settings`（`app_id = 'home'`）→ `settings.portal_summary.storage_zone_count`
- 上报端：**HOME.PROJ.6a** `@life-os/sync` `syncHomePortalSummary`（Home 打开 / 项目变更时）
- Migrations：`20260708190000`（初版）→ `20260708191000`（Music）→ `20260709021500`（Home）
- 消费端：`apps/portal` `PortalTodaySummary.svelte`（五卡 + Fitness `workedOutToday`）
- **PLNR.CORE.4（无新 migration）：** 对齐 Planner Today 与 `portal_today_summary` 任务计数口径 — app 层快赢，见 [`roadmap/apps/planner.md`](../roadmap/apps/planner.md) §Supabase

## PlannerOS — Supabase ticket 状态（2026-07-12）

> **复核方法：** 生产 `schema_migrations` + `information_schema`（MCP）· `origin/master` 代码 · 本地 vitest/playwright 锚点
> **Hub 分线：** [`../roadmap/AGENT_WORKSTREAMS.md`](../roadmap/AGENT_WORKSTREAMS.md) · **产品分卷：** [`../roadmap/apps/planner.md`](../roadmap/apps/planner.md)

**状态图例（三层）：**

| 标记 | 含义 |
| ---- | ---- |
| **✅** | 该层已闭合（migration 已上生产 / 代码已合 master / gate PASS） |
| **🟡** | 部分闭合或 ops 未强制验收 |
| **⏳** | 进行中（Hub §Now/§Next 或快赢副线） |
| **🔒** | 硬依赖未满足 |
| **❌** | 未开始 |

**Authoring：** `apps/planner/supabase/migrations/` · **Deploy：** `./scripts/supabase-sql.sh -f …` 或 fold 进 `apps/finance/supabase/migrations/`

### 主表 — ticket ↔ migration ↔ 三层状态

| Hub Ticket | Migration 文件 | 生产 DB 对象 | Migration | App 代码 | Gate / 验收 | **Hub 状态** |
| ---------- | -------------- | ------------ | --------- | -------- | ----------- | ------------ |
| **（结构化同步）** | `05130000` + `05140000` | `planner_user_state` · `planner_tasks` · `planner_lists` | ✅ baseline | ✅ `sync.js` · `repo.js` | ✅ 生产同步 | **✅ Shipped** |
| **PLNR.PROJ.0** | `10054418_planner_projects` | `planner_projects` | ✅ | ✅ `domain/projects.js` · structured pull/push | ✅ `repo.structured.test.js` | **✅ Shipped** |
| **PLNR.PROJ.1** | ↑ 同上 | ↑ | ✅ | ✅ `/projects` 列表/详情 | ✅ E2E | **✅ Shipped** |
| **PLNR.PROJ.2** | —（无额外 DDL） | ↑ | ✅ | ✅ QuickAddBar `@项目` · `projectId` | ✅ | **✅ Shipped** |
| **PLNR.PROJ.3** | — | ↑ | ✅ | ✅ Roadmap/repo refs UI | ✅ `project-references.spec.js` | **✅ Shipped** |
| **PLNR.CORE.1** | `09120000_planner_push_subscriptions` | `planner_push_subscriptions` · `planner_reminder_push_log` | ✅ | ✅ `pushSubscription.js` · `sendReminderPushes.mjs` | 🟡 VAPID/Netlify cron **未强制验收** | **🟡 Shipped（schema+code）** · ops 按需 |
| **PLNR.CORE.3** | 平台 `08000000` life_events | `life_events` 消费 | ✅ | ✅ `lifeEventsInbox.js` | ✅ inbox tests | **✅ Shipped** |
| **PLNR.CORE.5** | 平台 `08200000` fitness trigger | `fitness.workout_logged` | ✅ | ✅ inbox 打卡分支 | ✅ GYMS.EVENTS.1 | **✅ Shipped** |
| **PLNR.CORE.6** | — | —（客户端 Auth） | N/A | ✅ `@life-os/sync` 单例 | ✅ `supabaseClient.test.mjs` | **✅ Shipped** |
| **PLNR.CORE.4** | — | `portal_today_summary()` 已读 `planner_tasks` | ✅ RPC | ⏳ Planner `remaining`（逾期+今日）≠ Portal `todayOpen`（仅今日） | ⏳ 未对齐 | **⏳ Open** · 快赢副线 · 无 migration |
| **PLNR.ATTACH.0** | _(未建)_ | Storage + metadata | ❌ | ❌ | ❌ | **❌ Not started** · §Next |
| **PAPR.DATA.verify** | `10000500_add_paper_device_snapshot_rpc` | `paper_device_config` · `paper_device_snapshot()` | ✅ | ✅ `/api/paper/*` · device `ApiClient` | ✅ PASS 2026-07-11 | **✅ Shipped** |
| **PAPR.WRITE.5** | `09200000_add_paper_device_actions` | `paper_device_actions` | ❌ **表不存在** | ✅ `paperService.mjs` · `PAPER_ACTIONS_WRITE_ENABLED` 默认 off | ⏳ staging gate 未关 | **🟡 Code ✅ · DB ⏳ BLOCKED** · Hub Deferred |
| **PAPR.SYNC.6** | _(blocked)_ | — | 🔒 | 🟡 client sync only | 🔒 依赖 PAPR.SYS.2 | **🔒 Blocked** |

### 非 Supabase（相关 · 勿写入 migration 表）

| Hub Ticket | Supabase | 代码 | Gate | **Hub 状态** |
| ---------- | -------- | ---- | ---- | ------------ |
| **PLNR.SCHED.0.migrate** | — | ✅ `migrate.js` `tags: []` · **#15** `5c66d51e` | ✅ `migrate.integration.test.js` 23/23 | **✅ Shipped** |
| **PLNR.SCHED.0**（父） | — | 🟡 10.pwa 代码 ✅ #18 | ⏳ **10b.ios** 待 Ken | **⏳ Open**（migrate 子项已关） |

### 生产对象快照（2026-07-12 MCP）

**已存在：** `planner_user_state` · `planner_tasks` · `planner_lists` · `planner_projects` · `planner_push_subscriptions` · `planner_reminder_push_log` · `paper_device_config` · `paper_device_snapshot()`

**缺失（阻塞 PAPR.WRITE.5 DB 层）：** `paper_device_actions`

**`schema_migrations` 登记：** `20260710160000` · `20260710161000` · `20260710203000`（Planner DDL 已吸收进 baseline，无独立 `20260705*` / `20260709*` / `20260710*` 行）

### 下一步（仅 Supabase 动作）

1. **PAPR.WRITE.5** — apply `09200000` 到 staging → gate → 生产；写开关仍默认 off
2. **PLNR.CORE.4** — 纯 app/RPC 口径对齐（无 migration）
3. **PLNR.ATTACH.0** — 新建 migration + Storage policies
4. **PLNR.CORE.1** — 可选：VAPID + `planner-reminder-push` cron 生产验收

## App 级 schema（同项目，分 schema / 前缀）

| App     | DB 位置                                    | 说明                                                     |
| ------- | ------------------------------------------ | -------------------------------------------------------- |
| Finance | `public` 表（`finance_*` 前缀）            | 主业务 + 扩展 sync                                       |
| Planner | `public.planner_*` · `paper_device_*`      | Authoring：`apps/planner/supabase/migrations/` · ticket 表见上节 |
| Fitness | `fitness` schema                           | baseline + `20260710161000`                              |
| Music   | `music` schema + RPC                       | 见 `apps/music/supabase/migrations/`、`apps/music/docs/` |

## Auth redirect URLs

生产四站已在 Supabase allow list：

- `https://{finance,planner,fitness,music}.kenos.space/**`
- `https://{finance,planner,fitness,music}os-ken.netlify.app/**`

**Portal（INTG.EVENTS.1）：** `https://portal.kenos.space/**` + `https://portal-ken.netlify.app/**`（2026-07-08 远程已对齐）

**Home（HOME.SSO.3）：** `https://home.kenos.space/**` + `https://homeos-ken.netlify.app/**`（2026-07-09 远程已对齐）

## 相关脚本

| 脚本                                      | 用途                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `./scripts/verify-life-os-identity-p0.sh` | INTG.IDENTITY.0 自动化验收                                                    |
| `./scripts/test-outbox-trigger.sh`        | INTG.EVENTS.1.5 结构检查；`--smoke` 端到端；`--apply-migration` 首次 deploy |
| `./scripts/supabase-sql.sh`               | 远程 SQL 执行                                                      |

## 回滚注意

平台 migration 回滚需手动 DROP / DELETE migration 记录；见 archive [`LIFE_OS_IDENTITY_P0.md`](../archive/LIFE_OS_IDENTITY_P0.md) 中的 rollback 示例。**生产前先在 staging 验证。**
