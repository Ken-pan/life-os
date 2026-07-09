# Roadmap 发货日志

从 hub §Shipped 链入。格式：**日期 · 摘要 · commit（可选）**

维护：每次完成 hub §Now 项后追加一行；不必复制整表。

---

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
