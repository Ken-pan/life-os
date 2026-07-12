# Life OS P0 — Shared Identity Foundation

> **Scope:** 统一四站 `auth.uid()` 与共享 `core_profiles` / `core_user_app_settings`；**不**合并业务数据。

**Migration:** `apps/finance/supabase/migrations/20260707230000_life_os_shared_identity.sql`
**Supabase project:** `iueozzuctstwvzbcxcyh`

---

## 1. 架构摘要

| 层级        | 实现                                                       | 状态             |
| ----------- | ---------------------------------------------------------- | ---------------- |
| 统一 Auth   | 四站同一 Supabase project + `life_os_auth` storage key     | ✅ 已有，P0 加固 |
| 共享档案    | `public.core_profiles`                                     | ✅ 本迁移        |
| 按 App 设置 | `public.core_user_app_settings`                            | ✅ 本迁移        |
| 业务数据    | `finance_*` / `fitness_*` / `planner_*` / `music_*` 仍隔离 | 不变             |

### 表结构

**`core_profiles`** — `id` = `auth.users.id`

- `display_name`, `avatar_url`, `timezone`, `locale`, `default_app`
- RLS: `auth.uid() = id`

**`core_user_app_settings`** — PK `(user_id, app_id)`

- `app_id`: `finance` | `fitness` | `planner` | `music`
- `settings` jsonb, `last_opened_at`
- RLS: `auth.uid() = user_id`

新用户：`core_on_auth_user_created` 触发器自动建 profile + 四行 app settings。
已有用户：迁移 SQL 从 `auth.users` + `fitness_profiles` / `music_profiles` 回填。

---

## 2. Supabase Auth Redirect URLs

已通过 **Management API + `supabase config push`** 配置（无需 Dashboard 手点）：

```bash
# 查看当前配置
curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/iueozzuctstwvzbcxcyh/config/auth" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['uri_allow_list'])"

# 从 config.toml 推送（apps/finance/supabase/config.toml [auth]）
cd apps/finance && supabase config push --project-ref iueozzuctstwvzbcxcyh --yes
```

**当前已包含（17 条）：**

```txt
https://finance.kenos.space/**
https://music.kenos.space/**
https://planner.kenos.space/**
https://fitness.kenos.space/**
https://financeos-ken.netlify.app/**
https://musicos-ken.netlify.app/**
https://planneros-ken.netlify.app/**
https://fitnessos-ken.netlify.app/**
https://*.netlify.app/**
+ 本地 dev localhost/127.0.0.1 端口
```

**`site_url`** 保持 `http://localhost:5173`（P0 故意不改 apex）。

---

## 3. 环境变量

Netlify 四站已配 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`。

P0 代码变更：`@life-os/sync` 的 `resolveSupabaseEnv()` 同时读取：

- `PUBLIC_SUPABASE_*`（SvelteKit / Netlify）
- `VITE_SUPABASE_*`（Vite / 本地 `.env`）

本地开发任选一种前缀即可。

---

## 4. 应用层变更

| App                       | 文件                        | 变更                                               |
| ------------------------- | --------------------------- | -------------------------------------------------- |
| 全部                      | `src/lib/supabase.{js,ts}`  | `resolveSupabaseEnv` + `createSupabaseAuthOptions` |
| Planner / Fitness / Music | `src/lib/auth.svelte.js`    | `createCoreIdentityHandler` → 写 `last_opened_at`  |
| Finance                   | `src/auth/AuthGate.tsx`     | 同上                                               |
| Finance                   | `src/lib/supabaseTables.ts` | 注册 `core_profiles` / `core_user_app_settings`    |

**注意：** Fitness / Music client 默认 DB schema 非 `public`；`coreIdentity` 通过 `.schema('public')` 访问 core 表。

---

## 5. 应用迁移

```bash
cd "/Users/kenpan/「Projects」/life-os"
./scripts/supabase-sql.sh -f apps/finance/supabase/migrations/20260707230000_life_os_shared_identity.sql
```

或使用 Supabase MCP `apply_migration` / `execute_sql`（已应用）。

记录到 `supabase_migrations.schema_migrations`：

```sql
insert into supabase_migrations.schema_migrations (version)
values ('20260707230000')
on conflict do nothing;
```

### 自动化验收脚本

```bash
./scripts/verify-life-os-identity-p0.sh
```

覆盖：迁移记录、core 表、RLS、触发器、redirect URLs、Netlify env。

---

## 6. 验收清单

对 **同一邮箱** 在四个 custom domain 上执行：

### 6.1 登录 / Profile ID

- [ ] Finance 登录成功，Settings 可见用户邮箱
- [ ] Music / Planner / Fitness 分别登录成功
- [ ] Supabase SQL：`select id, display_name from core_profiles where id = auth.uid();` 四站为 **同一 UUID**
- [ ] `select * from core_user_app_settings where user_id = '<uuid>';` 有四行 app_id

### 6.2 Session 持久化

- [ ] 登录后 **硬刷新**（Cmd+Shift+R）仍保持登录
- [ ] 打开深链（如 `/settings`、`/library`）不丢 session

### 6.3 登出

- [ ] 在任一 App 登出 → 仅清本地 session，**不**删 `core_profiles` 或业务表数据
- [ ] 登出后刷新 → 显示登录页

### 6.4 跨域行为（P0 预期）

- [ ] **不同子域 session 不自动共享**（localStorage 按 origin 隔离）— 每站需单独登录一次
- [ ] 各站登录后 `auth.users.id` / `core_profiles.id` **相同**

### 6.5 last_opened_at

- [ ] 打开 Planner 后：`core_user_app_settings` 中 `app_id='planner'` 的 `last_opened_at` 更新

### 6.6 RLS

- [ ] 匿名用户 `select * from core_profiles` → 空集
- [ ] 用户 A 无法 `select` 用户 B 的 `core_user_app_settings`

---

## 7. Rollback

**仅当 P0 引发问题时执行；业务表不受影响。**

```sql
drop trigger if exists core_on_auth_user_created on auth.users;
drop function if exists private.core_handle_new_user();

drop table if exists public.core_user_app_settings;
drop table if exists public.core_profiles;

delete from supabase_migrations.schema_migrations
where version = '20260707230000';
```

应用层：revert `@life-os/sync` 与四站 `supabase.{js,ts}` / `auth` 改动即可；`fitness_profiles` / `music_profiles` 等 App 表 **保留**。

---

## 8. 下一步（Integration 主线）

出口条件与后续阶段已迁入总路线图，避免与本文件重复维护：

→ **[`LIFEOS_INTEGRATION_ROADMAP.md`](./LIFEOS_INTEGRATION_ROADMAP.md)**

| 阶段          | 文档                                                                     | 状态            |
| ------------- | ------------------------------------------------------------------------ | --------------- |
| INTG.IDENTITY.0 收尾     | 本文 §6 手动验收                                                         | ⏳ 四站登录确认 |
| INTG.EVENTS.1 Portal   | [`LIFEOS_PORTAL_P1.md`](./LIFEOS_PORTAL_P1.md)                           | 📋 下一步       |
| INTG.EVENTS.1.5 事件层 | [`LIFEOS_LIFE_EVENTS_P1_5.md`](./LIFEOS_LIFE_EVENTS_P1_5.md)             | 📋              |
| INTG.EVENTS.2 智能互通 | [`LIFEOS_INTEGRATION_ROADMAP.md`](./LIFEOS_INTEGRATION_ROADMAP.md) §INTG.EVENTS.2 | ⏸️              |

**INTG.IDENTITY.0 出口 checklist：**

- [x] 四站 custom domain SSL Ready
- [x] Supabase redirect URLs 已配置
- [x] `./scripts/verify-life-os-identity-p0.sh` 通过
- [ ] 同一邮箱四站登录，`core_profiles.id` 一致

---

## 10. MCP / CLI 执行记录（2026-07-08）

| 步骤                                       | 工具                                          | 结果                                           |
| ------------------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| 迁移 `20260707230000`                      | `supabase-sql.sh` + MCP `list_migrations`     | ✅ 已记录                                      |
| `core_profiles` / `core_user_app_settings` | MCP `execute_sql`                             | ✅ 表结构 + RLS 6 policies                     |
| `core_on_auth_user_created` 触发器         | MCP `execute_sql`                             | ✅ 与 fitness/music 触发器并存                 |
| Security advisors                          | MCP `get_advisors`                            | ⚠️ 无 core 表 RLS 缺失；既有 storage/auth 警告 |
| Auth redirect URLs                         | Management API PATCH + `supabase config push` | ✅ 17 条 URL                                   |
| Netlify env 四站                           | `netlify env:set` + `env:list --json`         | ✅ 各站 4/4 `PUBLIC_*` + `VITE_*`              |
| 代码构建                                   | `npm run build`                               | ✅ 四 app 通过                                 |
| 自动化验收                                 | `./scripts/verify-life-os-identity-p0.sh`     | ✅ 全部通过                                    |

**待你手动确认：** 在四站 custom domain 各登录一次，核对 `core_profiles.id` 一致（浏览器跨域 session 仍隔离，属 P0 预期）。

---

## 9. 已知限制（by design）

1. **无跨子域 SSO**：P0 不做共享 cookie；每 origin 独立 `life_os_auth` localStorage。
2. **App 级 profiles 仍存在**：`fitness_profiles` / `music_profiles` 未删除；`core_profiles` 为跨 App 真源，后续可逐步同步 display_name。
3. **Finance 无注册 UI**：新用户需在 Planner/Fitness/Music 注册，或 Supabase Dashboard 邀请。
