# Life OS Supabase

> **项目 ref：** `iueozzuctstwvzbcxcyh`（四站 + Portal 共用）
> **Canonical 迁移目录：** `apps/finance/supabase/`（`schema.sql` + `migrations/`）
> **路线图：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)

**最后与代码同步：** 2026-07-09

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

## 平台级迁移（Integration / 共享 public 表）

| Version          | 文件                                                     | 阶段   | 远程状态（2026-07-09）                                 |
| ---------------- | -------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `20260707230000` | `migrations/20260707230000_life_os_shared_identity.sql`  | I-P0   | ✅ 已 apply                                            |
| `20260708000000` | `migrations/20260708000000_life_events_and_outbox.sql`   | I-P1.5 | ✅ 已 apply（触发器挂 `finance_expected_occurrences`） |
| `20260708120000` | `migrations/20260708120000_portal_app_id_constraint.sql` | I-P1   | ✅ 已 apply（`app_id` 含 `portal` + 回填）             |
| `20260708180000` | `migrations/20260708180000_home_app_id_constraint.sql`   | H-P3   | ✅ 已 apply（`app_id` 含 `home` + 回填 + `life_os_modules`） |
| `20260708190000` | `migrations/20260708190000_portal_today_summary_rpc.sql` | G-P4   | ✅ 已 apply（`portal_today_summary()` RPC）            |

### I-P0：`core_profiles` + `core_user_app_settings`

- 表：`public.core_profiles`、`public.core_user_app_settings`
- Auth 触发器：`auth.users` → `core_on_auth_user_created`
- 客户端：`@life-os/sync` 的 `createCoreIdentityHandler`（四站 + Portal + Home）
- 验收：`./scripts/verify-life-os-identity-p0.sh`

### I-P1.5：`life_events` + Outbox 触发器

- 表：`public.life_events`（`status`: pending / processed / failed）
- 触发器：`finance_expected_occurrences` insert（`source_type = 'card_bill'`）→ `finance.bill_due` 事件
- 契约：`@life-os/contracts/events`（Zod `FinanceBillDueSchema` + `parseLifeEvent`）
- 验收：`./scripts/test-outbox-trigger.sh`（结构检查）；`./scripts/test-outbox-trigger.sh --smoke`（插入 + Zod 断言 + 清理）
- **Planner 消费端：** `src/lib/services/lifeEventsInbox.js` — poll pending → 幂等任务 → mark processed

`schema.sql` 已含 I-P0 `core_*` + I-P1.5 `life_events` DDL（2026-07-08 merge）；远程需单独 apply migration。

### G-P4：`portal_today_summary()` RPC

- 函数：`public.portal_today_summary()` — 返回 Planner 今日/逾期、Finance 月收支结余、Fitness 最近完练（`security invoker`）
- Migration：`20260708190000_portal_today_summary_rpc.sql`
- 消费端：`apps/portal` `PortalTodaySummary.svelte`

## App 级 schema（同项目，分 schema / 前缀）

| App     | DB 位置                                    | 说明                                                     |
| ------- | ------------------------------------------ | -------------------------------------------------------- |
| Finance | `public` 表（`accounts`、`transactions`…） | 主业务 + 扩展 sync                                       |
| Planner | `public.planner_*`                         | 亦见 `apps/planner/supabase/migrations/`（历史副本）     |
| Fitness | `fitness` schema                           | migration `20260705140000_fitness_schema.sql`            |
| Music   | `music` schema + RPC                       | 见 `apps/music/supabase/migrations/`、`apps/music/docs/` |

Finance 仓内的 `apps/finance/supabase/migrations/` 是 **Life OS 全项目** 迁移的 canonical 落点（含 planner/fitness/music 部分历史 migration 文件名）。

## Auth redirect URLs

生产四站已在 Supabase allow list：

- `https://{finance,planner,fitness,music}.kenos.space/**`
- `https://{finance,planner,fitness,music}os-ken.netlify.app/**`

**Portal（I-P1）：** `https://portal.kenos.space/**` + `https://portal-ken.netlify.app/**`（2026-07-08 远程已对齐）

**Home（H-P3）：** `https://home.kenos.space/**` + `https://homeos-ken.netlify.app/**`（2026-07-09 远程已对齐）

## 相关脚本

| 脚本                                      | 用途                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `./scripts/verify-life-os-identity-p0.sh` | I-P0 自动化验收                                                    |
| `./scripts/test-outbox-trigger.sh`        | I-P1.5 结构检查；`--smoke` 端到端；`--apply-migration` 首次 deploy |
| `./scripts/supabase-sql.sh`               | 远程 SQL 执行                                                      |

## 回滚注意

平台 migration 回滚需手动 DROP / DELETE migration 记录；见 archive [`LIFE_OS_IDENTITY_P0.md`](../archive/LIFE_OS_IDENTITY_P0.md) 中的 rollback 示例。**生产前先在 staging 验证。**
