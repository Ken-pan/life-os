# Integration 主线（I-_ / H-_）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。

---

## I-P0: 统一身份 {#i-p0}

**目标：** 四生产站 + Portal + Home（按需）共用 `auth.uid()` 与 `core_profiles`，跨 `.kenos.space` SSO。

| 子项                                       | 状态    | 证据                                      |
| ------------------------------------------ | ------- | ----------------------------------------- |
| `core_profiles` + `core_user_app_settings` | ✅ 远程 | migration `20260707230000`                |
| 四站 Auth hooks                            | ✅      | `createCoreIdentityHandler`               |
| 客户端 profile 兜底                        | ✅      | `packages/sync/src/coreIdentity.js`       |
| 跨子域 SSO Cookie                          | 🟡      | `setupCrossDomainSSO`；待生产 E2E         |
| `schema.sql`（`core_*`）                   | ✅      | merge 进 canonical（2026-07-08）          |
| 验收脚本                                   | ✅      | `./scripts/verify-life-os-identity-p0.sh` |

**SSO 下一步：**

- 生产 `.kenos.space` 跨站免登人工验收
- `localhost` / preview 跨站仍有限（Cookie 仅 `*.kenos.space`）
- 可选：环境变量动态 cookie domain；或 `@supabase/ssr` Server Client

---

## I-P1: Portal 统一入口 {#i-p1}

**URL：** https://portal.kenos.space（Netlify `portal-ken`，`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）

| 子项                        | 状态 | 证据                                                           |
| --------------------------- | ---- | -------------------------------------------------------------- |
| SvelteKit app               | ✅   | Launcher + `PortalLauncherCard` + `CommandPalette` + G-P1–G-P5 |
| SSO / coreIdentity          | ✅   | `createCoreIdentityHandler('portal')`                          |
| Netlify + DNS               | ✅   | 四生产站 + Portal + Home；HTTP 200 已验证                      |
| Turbo / GHA build           | ✅   | `npm run build` 含 `portal`                                    |
| Auth redirect               | ✅   | `portal.kenos.space/**` 远程已配置（2026-07-08）               |
| Portal 内登录               | ✅   | `PortalUnauth` + `createLifeOsAuth`                            |
| DB `app_id` / `default_app` | ✅   | constraint 含 `portal`；migration `20260708120000`             |

**Growth（已落地 2026-07-08）：** 见 [`GROWTH.md`](./GROWTH.md) G-P1–G-P5（读 `core_*`、角标、PWA）

---

## Growth 项（Portal 读 `core_*`）{#growth-portal}

详情 → [`GROWTH.md`](./GROWTH.md)

| ID   | 状态 | 摘要                                                |
| ---- | ---- | --------------------------------------------------- |
| G-P1 | ✅   | `recentApp` 读 DB `last_opened_at`，跨设备「继续」  |
| G-P2 | ✅   | 只读待办 / `life_events` 角标（生产 bill_due 待验） |
| G-P3 | ✅   | `default_app` 登录后跳转                            |
| G-P5 | ✅   | 六站 PWA 安装引导                                   |

## I-P1.5: 跨应用事件中心 {#i-p15}

**示例链路：** Finance 账单到期 → Planner 任务

| 子项                   | 状态 | 证据                                                           |
| ---------------------- | ---- | -------------------------------------------------------------- |
| Zod 事件契约           | ✅   | `packages/contracts/src/events.ts`                             |
| DB + Outbox 触发器     | ✅   | `finance_bill_event_trigger` on `finance_expected_occurrences` |
| 远程 migration         | ✅   | `20260708000000`                                               |
| Planner 消费端         | ✅   | `lifeEventsInbox.js`                                           |
| 集成测试               | ✅   | `./scripts/test-outbox-trigger.sh --smoke`                     |
| `schema.sql`（I-P1.5） | ✅   | DDL 已在 `apps/finance/supabase/schema.sql`                    |

**架构（Outbox + consume）：**

1. `@life-os/contracts/events` — `finance.bill_due` + envelope
2. `finance_expected_occurrences` insert → `life_events` 同事务
3. Planner poll → `parseLifeEvent` → 幂等任务 → `processed`

**扩展（低优先级 · I-P1.5b）：** Fitness 完练 → Planner 打卡；**须有每天用两站场景**。管道已验收。见 [`GROWTH.md`](./GROWTH.md#i-p15b)。

RFC：[`../architecture/events-rfc.md`](../architecture/events-rfc.md)

---

## I-P2: 跨应用智能

⏸️ 搁置。待更多 `life_events` 消费端后再评估。

---

## H-P0: Home OS（第六 app · 实验）{#h-p0}

与 Portal **并存**（早期 archive 曾 portal/home 二选一；现 Portal = 启动器，Home = spatial 产品）。

| 子项            | 状态 | 证据                                                              |
| --------------- | ---- | ----------------------------------------------------------------- |
| SvelteKit app   | 🟡   | 概览 / 平面 `/plan` / 储藏 `/storage` / 设置                      |
| Spatial 编辑    | 🟡   | `FloorPlanViewer`、墙/门拖拽、undo；工坊 `?studio=1`              |
| 导出            | ✅   | HTML / MHTML audit 导出                                           |
| 共享包          | ✅   | contracts + platform-web + sync + theme                           |
| design-tokens   | ✅   | `tokens/brands/home.json` · `LIFE_OS_SITE_META.home`              |
| Turbo / build   | ✅   | `npm run build:home` · 含于 `npm run build`                       |
| Netlify 部署    | 🟡   | `homeos-ken` → `home.kenos.space`；`deploy-all-netlify.sh` 第六站 |
| Portal Launcher | ❌   | `PORTAL_APPS` 仅四生产站；Home 未露出                             |
| `coreIdentity`  | ❌   | 无 `createCoreIdentityHandler('home')`                            |
| SSO / redirect  | ❌   | Supabase 未加 `home.kenos.space/**`；DB check 未含 `home`         |
| 云同步          | ❌   | `homeos_spatial_v1` localStorage only                             |

### Home 排期（hub §Next / §Parked）

| ID       | 主题                    | ROI | 依赖          | 说明                                        |
| -------- | ----------------------- | --- | ------------- | ------------------------------------------- |
| **H-P1** | Portal Launcher 实验卡  | ○   | 无            | 第五格或「实验」区；链 `home.kenos.space`   |
| **H-P2** | 接 `coreIdentity` + SSO | ○   | I-P0 模式已通 | 与四站同 `createCoreIdentityHandler`        |
| **H-P3** | redirect + DB `app_id`  | ○   | H-P2          | `home.kenos.space/**`；constraint 扩 `home` |
| **H-P4** | spatial 云同步          | ⏸️  | H-P2/3        | Supabase 表 + `sync.js`；大投入             |
| **H-P5** | 工坊默认开              | ⏸️  | —             | 去掉 `?studio=1` gate 或设置项              |

**触发 H-P2/3：** 你开始**每天用 Home** 时，可与 I-P0 SSO 同批做 redirect + identity。

**提交纪律：** 勿将 `apps/home/**` 与 platform/catalog 变更混 PR（除非明确做 Home）。
