# Roadmap 发货日志

从 hub §Shipped 链入。格式：**日期 · 摘要 · commit（可选）**

维护：每次完成 hub §Now 项后追加一行；不必复制整表。

---

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
