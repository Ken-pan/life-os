# Life OS Portal — I-P1 Plan

> **Integration Phase 1：** 统一入口 / App Launcher
> 前置：**I-P0** [`LIFE_OS_IDENTITY_P0.md`](./LIFE_OS_IDENTITY_P0.md) 出口条件满足
> 总路线图：[`LIFEOS_INTEGRATION_ROADMAP.md`](./LIFEOS_INTEGRATION_ROADMAP.md)

---

## 目标

打开 **一个入口** 即可看到四系统状态，并跳转到各 App。第一版不求功能全，求 **稳、可部署、可回滚**。

**建议 URL：** `https://home.kenos.space`
**暂不做：** apex `https://kenos.space` 首页（等四站 + Portal 稳定）

---

## 非目标（I-P1 明确不做）

- 跨子域 SSO / 共享 cookie session
- 合并四 App 为单 SPA
- 直接读 `finance_transactions` / `music_tracks` 等全量业务表
- `life_events` 完整消费链（留给 I-P1.5）
- Finance 注册 UI

---

## 技术选型建议

| 决策         | 建议                                           | 理由                                       |
| ------------ | ---------------------------------------------- | ------------------------------------------ |
| 框架         | **SvelteKit**（`apps/portal` 或 `apps/home`）  | 与 Planner/Fitness/Music 一致；静态 deploy |
| 部署         | Netlify 新站 `homeos-ken` → `home.kenos.space` | 对齐 [`NETLIFY.md`](./NETLIFY.md) 四站模式 |
| Auth         | 同 Supabase project + `life_os_auth`           | I-P0 已统一                                |
| 样式         | `@life-os/theme`                               | 视觉一致                                   |
| 身份 API     | `core_profiles` + `core_user_app_settings`     | I-P0 已建                                  |
| Workspace 名 | `portal-os` 或 `home-os`                       | 与 `planner-os` 等并列                     |

---

## 第一版信息架构

```
/home
├── 未登录 → /auth（邮箱密码，与 Planner 同类）
└── 已登录
    ├── App Launcher（四卡片 + 最后打开时间）
    ├── Auth Status（email, profile id, 各站 last_opened_at）
    ├── Today Overview（只读 stub → I-P1.5 接真数据）
    ├── Quick Actions（占位按钮，I-P1.5 接线）
    └── System Health（Supabase ping + 可选 Netlify status）
```

---

## 模块规格

### 1. App Launcher

| App     | 生产 URL                      | Fallback                            |
| ------- | ----------------------------- | ----------------------------------- |
| Finance | `https://finance.kenos.space` | `https://financeos-ken.netlify.app` |
| Music   | `https://music.kenos.space`   | `https://musicos-ken.netlify.app`   |
| Planner | `https://planner.kenos.space` | `https://planneros-ken.netlify.app` |
| Fitness | `https://fitness.kenos.space` | `https://fitnessos-ken.netlify.app` |

每张卡片显示：

- App 名 + 图标
- `core_user_app_settings.last_opened_at`（相对时间）
- 外链 `target="_blank"` 或同 tab（产品定一条即可）

### 2. Auth Status

- 当前 `auth.users.email`
- `core_profiles.display_name`
- 复制用 `core_profiles.id`（短 UUID 展示）
- 登出（仅清本 origin session）

### 3. Today Overview（v1 stub）

第一版可用 **静态占位 + TODO 注释**，接口预留：

| 来源 App | 展示字段（未来）                |
| -------- | ------------------------------- |
| Planner  | 今日 open 任务数                |
| Finance  | 本月预算余量 / 待处理 review 数 |
| Fitness  | 今日是否已练 / 下次训练         |
| Music    | 当前 focus 状态 / 最近播放      |

数据获取优先级：I-P1.5 `life_events` > 各 App 只读 RPC（不要直扫大表）。

### 4. Quick Actions（v1 占位）

- 「安排账单提醒到 Planner」→ disabled + tooltip「I-P1.5」
- 「开始 Workout」→ 链到 Fitness
- 「打开 Music Focus」→ 链到 Music

### 5. System Health

- Supabase：`select 1` 或 `GET /rest/v1/life_os_modules?select=slug&limit=1`
- 可选：四站 HTTP HEAD 检查（注意 CORS；可用 build-time 或 serverless function）

---

## Supabase / 配置清单

### Redirect URLs

在 I-P1 部署前追加（Management API 或 `config.toml`）：

```txt
https://home.kenos.space/**
https://homeos-ken.netlify.app/**
```

```bash
cd apps/finance
# 编辑 supabase/config.toml [auth] additional_redirect_urls
supabase config push --project-ref iueozzuctstwvzbcxcyh --yes
```

### 新 App 环境变量（Netlify）

```txt
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
VITE_SUPABASE_URL      # 可选，与 PUBLIC 同值
VITE_SUPABASE_ANON_KEY
```

### DNS（GoDaddy）

```txt
home.kenos.space  CNAME  homeos-ken.netlify.app
```

---

## 实施任务分解

| #   | 任务                                                                                 | 预估 |
| --- | ------------------------------------------------------------------------------------ | ---- |
| 1   | `apps/portal` SvelteKit 脚手架 + `netlify.toml`                                      | 2h   |
| 2   | 复用 `@life-os/sync` auth 模式（`initAuth` + `createCoreIdentityHandler('portal')`） | 1h   |
| 3   | `/auth` 登录页 + `/` launcher 布局                                                   | 3h   |
| 4   | 读 `core_profiles` + `core_user_app_settings` 展示                                   | 2h   |
| 5   | Netlify site + custom domain + redirect URLs                                         | 1h   |
| 6   | 更新 `docs/NETLIFY.md` + `verify` 脚本（可选第五站）                                 | 1h   |
| 7   | 手动验收清单                                                                         | 1h   |

**合计：** ~1–2 天

---

## 验收标准

- [ ] `home.kenos.space` HTTPS 可访问
- [ ] 未登录显示登录页；登录后显示四 App 卡片
- [ ] 登录后 `core_user_app_settings` 存在 `app_id='portal'`（若 portal 写入 app_id；或扩 enum）
- [ ] 从 Portal 点击四链可到达各 App
- [ ] Portal 登出不删 `core_profiles` / 业务数据
- [ ] `npm run build` monorepo 仍通过
- [ ] **不**要求：在 Portal 登录后四子域自动已登录

---

## `app_id` 扩展注意

I-P0 的 `core_user_app_settings.app_id` check 现为：

`finance | fitness | planner | music`

Portal 若需自己的 `last_opened_at`，I-P1 迁移需：

```sql
alter table public.core_user_app_settings
  drop constraint if exists core_user_app_settings_app_id_check;
alter table public.core_user_app_settings
  add constraint core_user_app_settings_app_id_check
  check (app_id in ('finance', 'fitness', 'planner', 'music', 'portal'));
```

并更新 `private.core_handle_new_user()` 种子行。

---

## Rollback

1. Netlify 停用 `homeos-ken` 或解除 `home.kenos.space` DNS
2. 删除 `apps/portal`（若未 merge）
3. 从 auth redirect list 移除 `home.kenos.space`（可选）
4. 无业务数据损失（Portal 无独立业务表）

---

## I-P1 完成后 → 启动 I-P1.5

当 Portal 能稳定展示用户身份与各 App 入口后，按 [`LIFEOS_LIFE_EVENTS_P1_5.md`](./LIFEOS_LIFE_EVENTS_P1_5.md) 添加 `life_events`，并把 Today Overview 从 stub 换成真实跨 App 摘要。
