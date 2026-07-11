# Roadmap 发货日志

从 hub §Shipped 链入。格式：**日期 · 摘要 · commit（可选）**

维护：每次完成 hub §Now 项后追加一行；不必复制整表。

## 2026-07-10（深度复核 · FT-P2 · PaperOS 1.1 · P-SCHED-0 根因）

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| Growth  | **FT-P2** Portal Fitness `workedOutToday` — migration **远程已应用** | migration `20260710203000` · `todaySummaryFormat.js` · Supabase list_migrations ✅ |
| PaperOS | **Slice 1.1** native toolbar + QML visual | `52ae55e0` · `d7c52858` · [`qa/paperos-core-slice-1-1-visual-delta-gate.md`](../qa/paperos-core-slice-1-1-visual-delta-gate.md) |
| Planner | **P-SCHED-0** Antigravity baseline + **SCH-0 根因** `migrateTask` 缺 `tags` | [`qa/planner-schedule-antigravity-baseline.md`](../qa/planner-schedule-antigravity-baseline.md) |
| Infra   | **P-MOVE-VERIFY** — 生产 Paper API 路由复核（401 非 404） | `curl https://planner.kenos.space/api/paper/today` · `apps/planner/static/_redirects` |

## 2026-07-10（Planner 日程 baseline · PaperOS Slice 1 · 文档复核）

| 主线    | 发货项 / 里程碑 | 证据 |
| ------- | --------------- | ---- |
| Planner | **P-SCHED-0** Antigravity baseline 完成（Scenario A 通过；legacy `tags` + mobile scroll 待修） | [`qa/planner-schedule-antigravity-baseline.md`](../qa/planner-schedule-antigravity-baseline.md) · `docs/qa/evidence/planner-schedule/2026-07-10/` |
| PaperOS | **Core Slice 1** System drawer · Gallery · native ink chrome · recovery gate | [`qa/paperos-core-slice-1-integration-gate.md`](../qa/paperos-core-slice-1-integration-gate.md) |
| PaperOS | **Slice 1.1** QML 视觉 delta（Gallery / Drawer / `+`）Antigravity PASS | [`qa/paperos-core-slice-1-1-visual-delta-gate.md`](../qa/paperos-core-slice-1-1-visual-delta-gate.md) |
| PaperOS | **P-MOVE-BLOCK** 当时登记 404 — **2026-07-10 复核改为 P-MOVE-VERIFY**（路由 401 正常） | 见 hub §深度复核 · [`planner-pro-move.md`](./apps/planner-pro-move.md) |
| Docs    | Hub 优先级复核 → **P-SCHED-0** · P-MOVE-BLOCK · FT-P5 · F-P6 · P-MOVE-UI | [`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) · [`AGENT_WORKSTREAMS.md`](./AGENT_WORKSTREAMS.md) · [`PRO_MOVE.md`](../PRO_MOVE.md) |

## 2026-07-10（Planner Projects · Home 墙图）

| 主线 | 发货项 | 证据 |
| ---- | ------ | ---- |
| Planner | **P-PROJ-0–2** 项目实体 + structured sync、Projects 列表/详情、任务 `@项目` 与 project chip | `935a5b78` · `7bacded2` · `planner_projects` 远程表 |
| Planner | **P-PROJ-3** 项目详情只读 Roadmap / repo refs；危险 URL 不渲染为链接；mobile + desktop E2E | `routes/projects/[id]/+page.svelte` · `project-references.spec.js` |
| Home | **H-W3–W5** 手绘分区、家具/储藏指派、迁移/文档；H-W0–W5 全线完成 | `b06217fe` · `test:plan-edit` 13 checks |
| PaperOS | **P-MOVE-1–4** launcher、离线读、CJK/分页、退出/恢复/systemd launcher | `51791a93` · `ea92f6dd` · `b662285a` |

---

## 2026-07-09（Portal UI 修复 · P-5b/P-12 · 第五轮）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Design | **P-5b** compact 顶栏 **More sheet**（主题 / 账号 / 退出）+ `lockScroll` | `PortalAppBarMoreSheet.svelte` · `PortalAppBar.svelte` |
| Design | **P-12** Launcher HOME.OS 实验卡左边框改 **虚线**，与摘要实验卡一致   | `PortalLauncherCard.svelte` · `app.css`   |
| QA     | 走查 **P-1–P-12 全部关闭**；`qa:smoke` 五卡 ✅                        | [`docs/qa/portal-screenshot-audit.md`](../qa/portal-screenshot-audit.md) 第五轮 |

## 2026-07-09（Portal UI 修复 · P-4/P-5/P-7/P-9/P-11）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Design | **P-4** BrandMark 40px · **P-11** 五卡 2×2+通栏 · **P-9** 状态 pill 对比度 | `PortalTodaySummary.svelte` · `app.css`   |
| Design | **P-7** 铃铛 inbox 角标 · 隐藏 appbar OS accent · **P-5** compact 44px 触控 | `PortalAppBar.svelte`                     |
| QA     | **P-8** mobile 视口截图 + `mobile-launcher.png`；`qa:smoke` 五卡 ✅ | `qa-screenshot.mjs` · 走查第四轮          |

## 2026-07-09（Phase 6 · H-P6a + G-P4b-H）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Home   | **H-P6a** `syncHomePortalSummary` — 储藏区数 → `core_user_app_settings.settings.portal_summary` | `packages/sync/src/homePortalMetadata.js` · `apps/home/src/lib/homePortalMetadata.js` |
| Growth | **G-P4b-H** `portal_today_summary` 扩 `home` + Portal 第五卡「储藏审计」深链 `/storage` | migration `20260709021500` · `PortalTodaySummary.svelte` |
| QA     | `qa:smoke` 五卡 ✅ · RPC 验收 `storageZoneCount: 8`                  | `qa-smoke.mjs` · `desktop-summary.png`    |

## 2026-07-09（Portal UI 截图走查 · 第二轮）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| QA     | 12 张截图 + `manifest.json`；G-P8 inbox 深链 desktop/mobile ✅；`qa:smoke` ✅ | [`docs/qa/portal-screenshot-audit.md`](../qa/portal-screenshot-audit.md) · `docs/ui-qa-screenshots/portal/` |
| 后续   | P-4/P-5/P-7/P-8/P-9 已于第四轮修复；P-5b/P-12 于第五轮关闭              | 走查报告 §问题清单                        |

## 2026-07-09（M-P5 行为分验收）

| 主线  | 摘要                                                                 | 证据                                           |
| ----- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Music | **M-P5** `qa:rec-behavior` **6/6** — complete 事件 → `recently completed` reason + Δscore 0.04 | `seed-m5-qa-library.mjs` · `qa-recommendation-behavior.mjs` |
| Infra | CI 增 `portal-qa-smoke` · `music-qa-rec-behavior`（secrets 缺则 skip） | `.github/workflows/ci.yml`                     |

## 2026-07-09（Phase 5 · Portal G-P8/G-P9 + P-1）

| 主线   | 摘要                                                                 | 证据                                      |
| ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Growth | **G-P8** pending 角标 + 状态文案 → `planner…/inbox` 深链             | `PortalAppBar.svelte` · `+page.svelte`    |
| Infra  | **G-P9** `qa:smoke.mjs` — **五卡** · inbox 深链 · ⌘K · Esc 关闭 ✅       | `apps/portal/scripts/qa-smoke.mjs`        |
| Design | **P-1** `--overlay-backdrop` 55% + CommandPalette blur 8px           | `design-tokens` · `CommandPalette.svelte` |

## 2026-07-09（四轮计划 · Phase 0–4 批次）

| 主线        | 摘要                                                                                              | 证据                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Finance     | **F-P3** `buildAugmentedDailyOutlook()` — Today 与 Spend 抽屉 STS 口径统一；`outlook.test.ts` 40 pass | `apps/finance/src/engine/outlook.ts`                                 |
| Growth      | **G-P4b-M** `portal_today_summary` 扩 Music 第四卡；骨架四卡                                      | migration `20260708191000` · `PortalTodaySummary.svelte`             |
| Growth      | **G-P6** Portal ⌘K 14 条跨站深链 + `portal_cp_recent_v1` 最近搜索；`test:cp` ✅                   | `commandPaletteActions.js` · `CommandPalette.svelte`                 |
| Planner     | **P-P2** Insight 批量排期 E2E — `localDateKey()` 修复 UTC/本地日；desktop **22/22**             | `scheduling.js` · `e2e.spec.js`                                      |
| Fitness     | **FT-P0** E2E **20/20**；**FT-P1** `fitness.workout_logged` 触发器远程 ✅                       | `apps/fitness/tests/` · migration `20260708200000`                   |
| Integration | **I-P1.5b** / **P-P5** Planner `lifeEventsInbox` 消费完练事件 → habit 打卡；inbox 测试 7/7      | `packages/contracts/src/events.ts` · `lifeEventsInbox.js`            |
| Music       | **M-P5** `qa:rec-behavior` 脚本就绪（QA 账号无曲库时 SKIP）                                       | `apps/music/scripts/qa-recommendation-behavior.mjs`                    |
| Infra       | CI 增 `planner-e2e-desktop` · `finance-ia-routes`（secrets 缺则 skip）                            | `.github/workflows/ci.yml`                                           |
| Portal      | UI 截图走查 + **P-2** ICON_REGISTRY 修复；`svelte-check` **0 errors**                             | [`docs/qa/portal-screenshot-audit.md`](../qa/portal-screenshot-audit.md) |

## 2026-07-08（Home Life OS 接入 + H-P5 平面 UX）

| 主线        | 摘要                                                                                      | 证据                                                 |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Integration | Home SSO 生产化：`touchAppLastOpened` + `lifeOsPresence`；migration `home` app_id 远程 ✅ | `apps/home/src/lib/lifeOsPresence.js` · Supabase MCP |
| Integration | Home PWA：`static/sw.js` + `SKIP_WAITING` 热更新；manifest shortcuts                      | `apps/home/static/` · `serviceWorker.js`             |
| Home        | H-P5：浏览/编辑双模式；`plan-viewport` CTM；`test:viewport` 67/67 ✅                      | `apps/home/scripts/plan-viewport-stress.mjs`         |
| Platform    | PWA SSOT 增 `home`；`npm run pwa:preview:home`                                            | `scripts/pwa/apps.config.mjs`                        |

## 2026-07-09（H-P1 Portal Home 实验卡）

| 主线   | 摘要                                                                                          | 证据                          |
| ------ | --------------------------------------------------------------------------------------------- | ----------------------------- |
| Growth | H-P1：`PORTAL_APPS` 加 `home`；独立「实验」区 + inline「实验」badge；default_app 仍仅四生产站 | `apps/portal/src/lib/apps.js` |

## 2026-07-09（F-P1 + G-P2 生产验收）

| 主线   | 摘要                                                                                                       | 证据                                                |
| ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Growth | G-P2：Portal AppBar 角标 ✅ — pending `life_events` 显示「1 条待处理事件」                                 | `portal.kenos.space` + 测试行后清理                 |
| Growth | F-P1：ExtensionSyncBridge 生产 toast ✅ — 模拟 `FOS_BRIDGE_CAPTURES` 后显示「Rocket Money 已同步」+ 时间戳 | `finance.kenos.space` CDP 注入（空 recurring rows） |
| Infra  | I-P1.5 outbox `--smoke` 远程 ✅ — `finance.bill_due` pending + cleanup                                     | `./scripts/test-outbox-trigger.sh --smoke`          |

## 2026-07-09（M-P2 Music UI E2E）

| 主线  | 摘要                                                                                          | 证据                               |
| ----- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
| Infra | M-P2：`qa-ui-flow.mjs` — 8 路由 smoke · IDB seed · playTracks · queue=2 · **15/15 pass**    | `apps/music/scripts/qa-ui-flow.mjs` |

## 2026-07-09（F-P0 Finance route smoke）

| 主线  | 摘要                                                                               | 证据                                  |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Infra | F-P0：`ia-qa-auth.mjs` 共享登录；`ia-route-smoke.mjs` **22/22** authenticated pass | `apps/finance/scripts/ia-qa-auth.mjs` |

## 2026-07-09（QA-P2 Planner desktop E2E）

| 主线  | 摘要                                                                               | 证据                                |
| ----- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| Infra | QA-P2：`e2e.helpers.js` 桌面 QuickAdd + 收件箱「添加灵感」；desktop **21/22** pass | `apps/planner/tests/e2e.helpers.js` |
| Infra | 遗留 P-1：Insight 批量排期（mobile + desktop）仍失败                               | `docs/qa/e2e-issues.md`             |

## 2026-07-09（G-P4 Portal 今日摘要）

| 主线   | 摘要                                                                                     | 证据                               |
| ------ | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Growth | G-P4：`portal_today_summary()` RPC — Planner 今日/逾期、Finance 月结余、Fitness 最近完练 | `portal.kenos.space`「今日摘要」区 |

## 2026-07-09（H-P1 生产 + H-P2/H-P3 Home SSO）

| 主线        | 摘要                                                                            | 证据                                             |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Growth      | H-P1：Portal「实验」区 + HOME.OS 卡 ✅ — `4 个生产应用 · 1 个实验`              | `portal.kenos.space` 生产 deploy                 |
| Integration | H-P2：`createLifeOsAuth('home')` + `setupCrossDomainSSO`；设置页账号区 ✅       | `home.kenos.space/settings` 跨域 Cookie 自动登录 |
| Integration | H-P3：`20260708180000` 扩 `app_id` 含 `home`；redirect `home.kenos.space/**` ✅ | `./scripts/verify-life-os-identity-p0.sh`        |
| Growth      | G-P2：Portal `life_events` pending 角标生产验收 ✅                              | 测试 pending 行 + Portal 角标                    |

## 2026-07-09（I-P0 生产 E2E + 关联验收）

| 主线        | 摘要                                                                                            | 证据                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Integration | I-P0：五站生产跨域 SSO ✅ — 同 `auth.uid()`（`c2831538…`）；`lifeos_shared_session` Cookie 生效 | Portal / Planner / Finance / Fitness / Music 浏览器验收  |
| Growth      | G-P1：Portal「继续」读 DB `last_opened_at` → Planner ✅                                         | `portal.kenos.space`「继续」区                           |
| Growth      | M-P1：`music.play_events` 生产已有 **167** 行 ✅                                                | `./scripts/supabase-sql.sh`                              |
| Platform    | AppBrandSwitcher 生产 ✅ — Finance 侧栏菜单含 5 站 + Home「实验」                               | `finance.kenos.space` 走查                               |
| Integration | I-P0 冷启动：Playwright 新 context 无 Cookie 时需重新登录（符合预期）                           | 严格无痕「先登 Finance 再开 Planner」仍建议人工复验 1 次 |

## 2026-07-08（Roadmap 4 周计划执行）

| 主线        | 摘要                                                                                       | 证据                                                    |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Integration | I-P1：`portal.kenos.space/**` 远程 auth redirect；`20260708120000` 扩 `app_id` 含 `portal` | `./scripts/verify-life-os-identity-p0.sh` ✅            |
| Integration | P2 债：`schema.sql` 合并 `core_profiles` + `core_user_app_settings`                        | `apps/finance/supabase/schema.sql`                      |
| Infra       | CI-补：`integration-smoke` job（boundaries + outbox 结构 + 可选远程 smoke）                | `.github/workflows/ci.yml`                              |
| Infra       | QA-F0：Fitness dev 端口 5190 + Playwright `reuseExistingServer: !CI`                       | `apps/fitness/vite.config.js`                           |
| Growth      | G-P1：Portal「继续」读 `core_user_app_settings.last_opened_at`                             | `apps/portal/src/lib/coreProfile.js`                    |
| Growth      | G-P3：`default_app` 设置 + 登录自动跳转                                                    | `PortalSettings.svelte` + `portalPreferences.svelte.js` |
| Growth      | G-P2：Portal `life_events` pending 角标                                                    | `PortalAppBar.svelte`                                   |
| Growth      | G-P5：Portal 六站 PWA 安装引导                                                             | `PortalPwaGuide.svelte`                                 |
| Growth      | M-P1：`play_events` 写入前 ensure `music_track_meta`；Queue 展示推荐 reasons               | `apps/music/src/lib/playEvents.js`                      |
| Growth      | F-P1：扩展 popup 失败重试 + 主站 sync toast 时间戳                                         | `popup.js` + `ExtensionSyncBridge.tsx`                  |
| Platform    | AppBrandSwitcher：六站侧栏跨 app 切换（`LIFE_OS_SWITCHER_APPS`；Home 标实验）              | `packages/platform-web` · `packages/theme/launcher.js`  |

## 2026-07-08

| 主线        | 摘要                                                                              | Commit     |
| ----------- | --------------------------------------------------------------------------------- | ---------- |
| Design      | D-P4 state matrix + CommandPalette showcase + P5 pixel baselines                  | `2a7ad397` |
| Design      | D-P4a matrix grid；smoke 扩至 152                                                 | `02c3733a` |
| Design      | D-P3 catalog UX + toast spacing + visual audit                                    | `ff37d401` |
| Design      | D-P3 banner tokens + P3c button/segment/toggle                                    | `7491989f` |
| Design      | D-P3b settings/toast/navigation deep tokens                                       | `bbdb27cd` |
| Design      | D-P3a card primitive + component tokens                                           | `f397abb6` |
| Design      | design-tokens 包 + 四站品牌迁移 D-P1/P2                                           | `13d78f67` |
| Design      | design-catalog thin preview D-P0                                                  | `e47992fa` |
| Integration | Portal DNS `portal.kenos.space` 上线验证                                          | —          |
| Docs        | Roadmap hub + `docs/roadmap/` 分卷；全局 docs 重组（ops/architecture/qa/tooling） | —          |

## 2026-07-07

| 主线        | 摘要                                             | Commit            |
| ----------- | ------------------------------------------------ | ----------------- |
| Platform    | C-P2 Wave 1 / 1.5 / 2 / 2.5 运行时与组件收编     | 见 git log `C-P2` |
| Integration | I-P0 migration `20260707230000` 远程 apply       | —                 |
| Integration | I-P1.5 migration `20260708000000` + outbox smoke | —                 |

---

## Platform Wave 明细（归档）

### Wave 1 运行时

| 提取项          | 落点                                          |
| --------------- | --------------------------------------------- |
| Supabase client | `@life-os/sync` `createLifeOsSupabaseClient`  |
| Auth 生命周期   | `createLifeOsAuth`                            |
| i18n            | `platform-web` `createI18n`                   |
| CommandPalette  | `@life-os/platform-web/CommandPalette.svelte` |

### Wave 1.5

Finance AuthGate、`platform-web` Toast、events RFC、`themePreference`、backup 骨架。

### Wave 2 组件

`head` / `icon` / `sync-error` / `navigation` / `settings/*` / `toast` / `backup`。

### Wave 2.5 品牌

`@life-os/theme/brand`；`AppBrand`；Finance `AppBrand.tsx`。

### Wave 3 P0 / P1+

PortraitGate、localCache、Portal AppBrand、MobileMoreSheet、Portal auth、Music contracts、Finance events smoke、Planner `lifeEventsInbox`。
