# Life OS Integration（四站互通）

> **主线：** 统一身份 → Portal → 事件层 → 跨 App 智能
> **并行：** Shared Platform 见 [`LIFEOS_PLATFORM.md`](./LIFEOS_PLATFORM.md)（**C-P0 / PLAT.CONTRACTS.1**）

**命名：** 本文用 **INTG.IDENTITY.0 / INTG.EVENTS.1 / INTG.EVENTS.1.5 / INTG.EVENTS.2**；勿与 contracts 主线的 C-P0/PLAT.CONTRACTS.1 混用。

**最后与代码同步：** 2026-07-08（`verify-life-os-identity-p0.sh` 自动化项通过；Portal / `life_events` 未开工）

---

## 原则

```txt
统一身份 · 统一入口 · 统一事件 · 独立业务域 · 受控互通
```

1. 不合并 `finance_*` / `music_*` / `planner_*` / `fitness_*` 业务表
2. 跨 App 数据走 `core_*` 或 `life_events`，不直扫对方全量表
3. 用户表一律 `auth.uid()` + RLS
4. 子域 ≠ 同源；localStorage session **不**自动跨站共享

---

## 阶段总览

| 阶段       | 名称                        | 代码/DB 状态                     |
| ---------- | --------------------------- | -------------------------------- |
| **INTG.IDENTITY.0**   | Shared Identity             | ✅ 已落地；⏳ 四站浏览器手动登录 |
| **INTG.EVENTS.1**   | Portal (`home.kenos.space`) | ❌ 无 `apps/portal`              |
| **INTG.EVENTS.1.5** | `life_events`               | ❌ 无迁移、无表                  |
| **INTG.EVENTS.2**   | Cross-App Intelligence      | ⏸️                               |
| —          | Apex `kenos.space`          | ⏸️                               |

**Next 3：** ① 四站登录验收 INTG.IDENTITY.0 → ② 建 Portal → ③ `life_events` 单路径 MVP

---

## 代码现状（INTG.IDENTITY.0）

### 共享包 `@life-os/sync`

| 导出                        | 文件                                | 用途                                           |
| --------------------------- | ----------------------------------- | ---------------------------------------------- |
| `resolveSupabaseEnv`        | `packages/sync/src/supabaseEnv.js`  | 读 `PUBLIC_*` 或 `VITE_*`                      |
| `createSupabaseAuthOptions` | 同上                                | `life_os_auth` + persist + refresh             |
| `createCoreIdentityHandler` | `packages/sync/src/coreIdentity.js` | profile 兜底 + `last_opened_at`                |
| `LIFE_OS_APP_IDS`           | `packages/sync/src/index.js`        | `finance` \| `fitness` \| `planner` \| `music` |

`coreIdentity` 通过 `supabase.schema('public')` 访问 core 表（Fitness/Music client 默认 schema 非 public）。

### 四站接入

| App     | Supabase client                    | Auth 钩子        | DB schema        | 本地 env 前缀                        |
| ------- | ---------------------------------- | ---------------- | ---------------- | ------------------------------------ |
| Planner | `apps/planner/src/lib/supabase.js` | `auth.svelte.js` | `public`（默认） | `PUBLIC_*` + fallback                |
| Fitness | `apps/fitness/src/lib/supabase.js` | `auth.svelte.js` | `fitness`        | `VITE_*` + fallback                  |
| Finance | `apps/finance/src/lib/supabase.ts` | `AuthGate.tsx`   | `public`（默认） | `VITE_*`（无 key 则 config-missing） |
| Music   | `apps/music/src/lib/supabase.js`   | `auth.svelte.js` | `music`          | `VITE_*` + fallback                  |

- **Auth 方式：** 四站均为 Email + Password；仓库内 **无** `auth/callback` / OAuth 路由
- **表名常量：** `apps/finance/src/lib/supabaseTables.ts` → `core.profiles` / `core.userAppSettings`
- **Music：** 已接 INTG.IDENTITY.0 身份钩子；**未**接 `@life-os/contracts`（见 Platform 文档）

### 数据库（远程已应用）

| 项                                         | 状态                               |
| ------------------------------------------ | ---------------------------------- |
| 迁移 `20260707230000`                      | ✅ `schema_migrations` 已记录      |
| `core_profiles` / `core_user_app_settings` | ✅ RLS + 6 policies                |
| `core_on_auth_user_created`                | ✅ 与 fitness/music 用户触发器并存 |
| 回填用户                                   | 2 行 profile（2026-07-08 验收时）  |

迁移文件：`apps/finance/supabase/migrations/20260707230000_life_os_shared_identity.sql`

### Auth redirect（远程）

17 条 URL（四站 `*.kenos.space`、四站 `*os-ken.netlify.app`、`*.netlify.app`、本地 dev）。
源：`apps/finance/supabase/config.toml` `[auth]` → `supabase config push`。

`site_url` 仍为 `http://localhost:5173`（故意不改 apex）。

### Netlify 环境变量（四站）

各站 **4/4**：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
修改 `packages/sync` 或任一 app 的 Supabase 初始化会触发四站 rebuild（`packages/*` 在 ignore 规则内）。

---

## INTG.IDENTITY.0 — 验收

```bash
./scripts/verify-life-os-identity-p0.sh
```

**自动化（2026-07-08）：** 迁移、表、RLS、触发器、redirect URLs ✅

**手动（同一邮箱，四 custom domain）：**

- [ ] 四站登录，`core_profiles.id` 相同 UUID
- [ ] 硬刷新 / 深链不丢 session
- [ ] 登出只清本地 session
- [ ] 跨子域各站需单独登录（预期）
- [ ] `last_opened_at` 随打开 App 更新

### Rollback

```sql
drop trigger if exists core_on_auth_user_created on auth.users;
drop function if exists private.core_handle_new_user();
drop table if exists public.core_user_app_settings;
drop table if exists public.core_profiles;
delete from supabase_migrations.schema_migrations where version = '20260707230000';
```

### 已知限制

- 无跨子域 SSO；`fitness_profiles` / `music_profiles` 仍保留
- Finance 无注册 UI

---

## INTG.EVENTS.1 — Portal 📋

**URL 规划：** `https://home.kenos.space`（`homeos-ken.netlify.app`）
**代码：** ❌ 尚未创建 `apps/portal` / `homeos-ken` Netlify site

| 项   | 计划                                                               |
| ---- | ------------------------------------------------------------------ |
| 框架 | SvelteKit `apps/portal`                                            |
| 包   | `@life-os/theme` + `@life-os/sync`                                 |
| 数据 | `core_profiles` + `core_user_app_settings`                         |
| v1   | Launcher、Auth status、Today stub、Quick actions 占位、Health ping |

部署前追加 redirect：`https://home.kenos.space/**`、`https://homeos-ken.netlify.app/**`

`app_id` 需扩 `portal`（当前 check 仅 `finance|fitness|planner|music`）。

---

## INTG.EVENTS.1.5 — `life_events` 📋

**代码/DB：** ❌ 未实现

计划：`public.life_events` + RLS；Finance `bill_due` → Planner task 为 MVP 路径。
事件类型契约后续进 `@life-os/contracts`。

---

## INTG.EVENTS.2 — Cross-App Intelligence ⏸️

Finance→Planner、Music↔Planner、Finance→AI 等；待 INTG.EVENTS.1.5 稳定后启动。

---

## 与 PLAT.CONTRACTS.1 并行

| 问题      | 建议                                                   |
| --------- | ------------------------------------------------------ |
| 优先级    | **INTG.EVENTS.1 Portal** 用户可感知优先                         |
| contracts | Planner/Fitness P1A/B/C ✅；Finance/Music 仍 app-owned |
| 事件类型  | 表在 Supabase；类型后进 contracts                      |

---

## 工具

| 资源          | 路径                                      |
| ------------- | ----------------------------------------- |
| Identity 验收 | `./scripts/verify-life-os-identity-p0.sh` |
| SQL           | `./scripts/supabase-sql.sh`               |
| 部署          | [`NETLIFY.md`](./NETLIFY.md)              |

---

_2026-07-08：文档与仓库对齐；合并原多份 Integration 子文档。_
