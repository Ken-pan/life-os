# Integration 主线（I-_ / H-_）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。**App 产品排期** → [`apps/README.md`](./apps/README.md)。

---

## INTG.IDENTITY.0: 统一身份 {#i-p0}

**目标：** 四生产站 + Portal + Home（按需）共用 `auth.uid()` 与 `core_profiles`，跨 `.kenos.space` SSO。

| 子项                                       | 状态    | 证据                                       |
| ------------------------------------------ | ------- | ------------------------------------------ |
| `core_profiles` + `core_user_app_settings` | ✅ 远程 | migration `20260707230000`                 |
| 四站 Auth hooks                            | ✅      | `createCoreIdentityHandler`                |
| 客户端 profile 兜底                        | ✅      | `packages/sync/src/coreIdentity.js`        |
| 跨子域 SSO Cookie                          | ✅      | `setupCrossDomainSSO`；生产 E2E 2026-07-09 |
| `schema.sql`（`core_*`）                   | ✅      | merge 进 canonical（2026-07-08）           |
| 验收脚本                                   | ✅      | `./scripts/verify-life-os-identity-p0.sh`  |

**SSO 备注：**

- 生产 `.kenos.space` 六站（含 Home）跨站免登 ✅（2026-07-09）
- `localhost` / preview 跨站仍有限（Cookie 仅 `*.kenos.space`）
- 可选：环境变量动态 cookie domain；或 `@supabase/ssr` Server Client

---

## INTG.EVENTS.1: Portal 统一入口 {#i-p1}

**URL：** https://portal.kenos.space（Netlify `portal-ken`，`a5df5c3e-0e42-4f82-aca8-8d6802da357f`）

| 子项                        | 状态 | 证据                                                           |
| --------------------------- | ---- | -------------------------------------------------------------- |
| SvelteKit app               | ✅   | Launcher + `PortalLauncherCard` + `CommandPalette` + PORT.GROWTH.1–PORT.GROWTH.5 |
| SSO / coreIdentity          | ✅   | `createCoreIdentityHandler('portal')`                          |
| Netlify + DNS               | ✅   | 四生产站 + Portal + Home；HTTP 200 已验证                      |
| Turbo / GHA build           | ✅   | `npm run build` 含 `portal`                                    |
| Auth redirect               | ✅   | `portal.kenos.space/**` 远程已配置（2026-07-08）               |
| Portal 内登录               | ✅   | `PortalUnauth` + `createLifeOsAuth`                            |
| DB `app_id` / `default_app` | ✅   | constraint 含 `portal`；migration `20260708120000`             |

**Growth（已落地）：** 见 [`GROWTH.md`](./GROWTH.md) PORT.GROWTH.1–PORT.GROWTH.5（读 `core_*`、角标、今日摘要、PWA）

---

## Growth 项（Portal 读 `core_*`）{#growth-portal}

详情 → [`GROWTH.md`](./GROWTH.md)

| ID   | 状态 | 摘要                                                 |
| ---- | ---- | ---------------------------------------------------- |
| PORT.GROWTH.1 | ✅   | `recentApp` 读 DB `last_opened_at`，跨设备「继续」   |
| PORT.GROWTH.2 | ✅   | 只读待办 / `life_events` 角标（生产验收 2026-07-09） |
| PORT.GROWTH.3 | ✅   | `default_app` 登录后跳转                             |
| PORT.GROWTH.4 | ✅   | `portal_today_summary()` 今日摘要三卡（2026-07-09）  |
| PORT.GROWTH.5 | ✅   | 六站 PWA 安装引导                                    |

## INTG.EVENTS.1.5: 跨应用事件中心 {#i-p15}

**示例链路：** Finance 账单到期 → Planner 任务

| 子项                   | 状态 | 证据                                                           |
| ---------------------- | ---- | -------------------------------------------------------------- |
| Zod 事件契约           | ✅   | `packages/contracts/src/events.ts`                             |
| DB + Outbox 触发器     | ✅   | `finance_bill_event_trigger` on `finance_expected_occurrences` |
| 远程 migration         | ✅   | `20260708000000`                                               |
| Planner 消费端         | ✅   | `lifeEventsInbox.js`                                           |
| 集成测试               | ✅   | `./scripts/test-outbox-trigger.sh --smoke`                     |
| `schema.sql`（INTG.EVENTS.1.5） | ✅   | DDL 已在 `apps/finance/supabase/schema.sql`                    |

**架构（Outbox + consume）：**

1. `@life-os/contracts/events` — `finance.bill_due` + envelope
2. `finance_expected_occurrences` insert → `life_events` 同事务
3. Planner poll → `parseLifeEvent` → 幂等任务 → `processed`

**扩展（INTG.EVENTS.1b ✅ 2026-07-09）：** Fitness 完练 → Planner habit 打卡；`fitness.workout_logged` 触发器 + `lifeEventsInbox.js` 消费。见 [`SHIPPED.md`](./SHIPPED.md)。

RFC：[`../architecture/events-rfc.md`](../architecture/events-rfc.md)

---

## INTG.EVENTS.2: 跨应用智能

⏸️ 搁置。待更多 `life_events` 消费端后再评估。

---

## HOME.EXPER.0: Home OS（第六 app · 实验）{#h-p0}

与 Portal **并存**（早期 archive 曾 portal/home 二选一；现 Portal = 启动器，Home = spatial 产品）。

| 子项            | 状态 | 证据                                                               |
| --------------- | ---- | ------------------------------------------------------------------ |
| SvelteKit app   | 🟡   | 概览 / 平面 `/plan` / 储藏 `/storage` / 设置                       |
| Spatial 编辑    | 🟡   | `/plan` **浏览 / 编辑**；墙/门拖拽、undo；`plan-viewport` CTM 定位 |
| 导出            | ✅   | HTML / MHTML audit 导出                                            |
| 共享包          | ✅   | contracts + platform-web + sync + theme                            |
| design-tokens   | ✅   | `tokens/brands/home.json` · `LIFE_OS_SITE_META.home`               |
| Turbo / build   | ✅   | `npm run build:home` · 含于 `npm run build`                        |
| Netlify 部署    | ✅   | `homeos-ken` → `home.kenos.space`；2026-07-09 生产 deploy          |
| Portal Launcher | ✅   | `PORTAL_APPS` 含 Home 实验卡（HOME.PORTAL.1 · 2026-07-09）                  |
| `coreIdentity`  | ✅   | `createLifeOsAuth('home')` → `createCoreIdentityHandler`（HOME.SSO.2）   |
| SSO / redirect  | ✅   | `home.kenos.space/**` + `20260708180000` constraint（HOME.SSO.3）        |
| Portal 继续     | ✅   | `touchAppLastOpened` 打开时写入 `last_opened_at`（PORT.GROWTH.1）           |
| PWA             | ✅   | `static/sw.js` + `bindPwaForegroundResume`                         |
| 云扫描 / 事件   | ✅   | `home.scans` + 私有照片桶 + `home.events` 三条 migration 均已在远程生产链（2026-07-17 实测） |
| 物体识别数据层  | ✅   | migration 生产注册 + git 闭环（`HOME.RECOG.0` · `5a2b7773`）；embedding/matcher/证据 UI 已验 |
| 项目同步        | 🟡   | 可编辑 `homeos_spatial_v1` 仍是本地真源；完整跨设备编辑未完成      |

### Home 排期（hub §Now / §Next / §Parked）

| ID       | 主题                    | ROI | 依赖 | 说明                                |
| -------- | ----------------------- | --- | ---- | ----------------------------------- |
| **HOME.PORTAL.1** | Portal Launcher 实验卡  | ✅  | —    | `portal.kenos.space` 实验区         |
| **HOME.SSO.2** | 接 `coreIdentity` + SSO | ✅  | —    | `apps/home/src/lib/auth.svelte.js`  |
| **HOME.SSO.3** | redirect + DB `app_id`  | ✅  | —    | migration + Supabase Management API |
| **HOME.SYNC.4** | 扫描 / 照片 / 事件云链路 | ✅  | —    | scans/storage/events 均在生产远程确认 |
| **HOME.RECOG.0** | 物体识别生产↔git 闭环 | ✅  | HOME.SYNC.4 | `20260717120000` + embed 服务入仓 |
| **HOME.RECOG.1–3** | 安静扫描 → matcher → 证据确认 + /plan 横幅 | ✅ 主航道 | HOME.RECOG.0 | `4675dd06` 横幅；见 app 文档 |
| **HOME.RECOG.refine** | Mac auto-refine（embed+match 15min） | ✅ 代码 / ⏳ 用户 gate | RECOG.2 | `refine.sh` + launchd；用户自装 |
| **HOME.RECOG.1r** | 认亲窄残余 | ◆ | RECOG.1–3 | hub §Next；区域高精度 + 摘要签收 |
| **HOME.MCP.13** | `where_is` → AIOS | ◆◆ | STORAGE.19 | hub §Next |
| **HOME.PROJ.4** | 完整 spatial 项目同步    | ⏸️  | HOME.SYNC.4 | 编辑真源跨设备、冲突与多项目身份；仍属大投入 |
| **HOME.PROJ.5** | 平面双模式（浏览/编辑） | ✅  | —    | 已去掉工坊 gate；无墙图/测距入口    |

**提交纪律：** 勿将 `apps/home/**` 与 platform/catalog 变更混 PR（除非明确做 Home）。
