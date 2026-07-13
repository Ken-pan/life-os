# Platform 主线（PLAT.* · legacy `C-*`）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。**Canonical ID：** [`TICKET_NAMING.md`](./TICKET_NAMING.md) · `PLAT.CONTRACTS.*` / `PLAT.CORE.*`

---

## C-P0 & PLAT.CONTRACTS.1 — 已完成

| 子项                                                   | 状态 |
| ------------------------------------------------------ | ---- |
| `@life-os/contracts`（7 type-only + `events` runtime） | ✅   |
| `@life-os/platform-web`                                | ✅   |
| `npm run check:lifeos-boundaries`                      | ✅   |
| Planner / Fitness P1A/B/C                              | ✅   |

---

## PLAT.CONTRACTS.1+: 平台扩容 — 低优先级（暂缓大项）

> **ROI 评审（2026-07-08）：** `contracts/events` 已接；Finance React 共享 UI / nav mirror **移出 §Now**，见 hub §Next ✗。仅 Finance 一个 React 栈时不做 `ui-react`。

| App     | contracts  | platform-web                  | 备注                                                                  |
| ------- | ---------- | ----------------------------- | --------------------------------------------------------------------- |
| Planner | ✅ mirrors | ✅ meta + i18n                | 试点完成                                                              |
| Fitness | ✅ mirrors | ✅ meta + i18n                | 试点完成                                                              |
| Finance | 🟡 events  | 🟡 部分                       | enrichment-contract；`createLifeOsAuth` / `localCache` / theme 已共享 |
| Music   | ✅ mirrors | ✅ i18n + AppBrand            | nav 内容 app-owned                                                    |
| Portal  | ✅ dep     | ✅ CommandPalette + AppBrand  | CI build ✅                                                           |
| Home    | ✅ dep     | ✅ AppBrandSwitcher + SideNav | 实验；`home.kenos.space` 已部署                                       |

**待办（低优先级）：** Finance React 共享 UI — 见 [`BACKLOG.md`](./BACKLOG.md) P2；**不在当前 2–3 周执行顺序内**。

---

## C-P2 已完成 Waves（摘要）

原则：**3+ app 逐字节重复才提取**；Svelte 组件直出 `platform-web/svelte/*`。

| Wave           | 日期       | 要点                                                                         |
| -------------- | ---------- | ---------------------------------------------------------------------------- |
| **1** 运行时   | 2026-07-07 | Supabase client、Auth、`createI18n`、CommandPalette 子路径                   |
| **1.5** 高风险 | 2026-07-07 | Finance Auth、Toast、events RFC、themePreference、backup 骨架                |
| **2** 组件层   | 2026-07-07 | head/icon/sync-error/navigation/settings/toast/backup                        |
| **2.5** 品牌   | 2026-07-08 | `@life-os/theme/brand` + `AppBrand` / Finance React 薄壳                     |
| **2.6** 切换器 | 2026-07-08 | `AppBrandSwitcher`（Svelte + Finance React）；`LIFE_OS_SWITCHER_APPS` 六 app |
| **3 P0**       | 2026-07-08 | PortraitGate、localCache、Portal AppBrand                                    |
| **3 P1+**      | 2026-07-08 | MobileMoreSheet、Portal auth、Music contracts、Finance events、Planner inbox |

Wave 逐表证据 → [`SHIPPED.md`](./SHIPPED.md) §Platform

---

## PLAT.SHELL — AppShell → App Generator 主线

目标：可复用 `LifeOsAppShell` → starter template → AppManifest → **app
generator**(一键生成新的 Life OS app)。

| Ticket             | Legacy      | 内容                                        | 状态                                                                                             |
| ------------------ | ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **PLAT.SHELL.1**   | `PLAT-P0-1` | `LifeOsAppShell` 提取,Fitness 试点         | ✅ [`架构合同`](../architecture/life-os-app-shell.md)                                            |
| **PLAT.SHELL.2**   | `PLAT-P0-2` | Home 采用验证(`locked` 模式 + `mainClass`)| ✅ **39/40** [`验证记录`](../architecture/life-os-app-shell-home-validation.md)                  |
| **PLAT.SHELL.3**   | `PLAT-P0-3` | **合同冻结 v1** + 迁移指南                  | ✅ 2026-07-12 [`迁移指南`](../architecture/life-os-app-shell-migration-guide.md)                 |
| **PLAT.SHELL.4**   | —           | 第三 app 采用:Music(v1.1 增量 `shellClass`/`shellDataset`)| ✅ **39/40** 2026-07-12 [`验证记录`](../architecture/life-os-app-shell-music-validation.md) |
| **PLAT.SHELL.5**   | —           | Starter template:`apps/starter` 活模板 + `scripts/create-life-os-app.mjs` | ✅ 2026-07-12 [`README`](../../apps/starter/README.md);shell+theme+i18n+PWA 骨架,workspace 常绿,spec 3/3 |
| **PLAT.SHELL.6**   | —           | AppManifest + generator(声明式生成新 app;自动化晋升清单:brand/site-meta/switcher/PWA矩阵/netlify) | ✅ 2026-07-12 `apps/<id>/app.manifest.json` + `scripts/promote-life-os-app.mjs`;16 个接线点幂等自动化,demo app E2E 全绿(check / boundaries / build / shell spec 3/3) |

**SHELL.6 说明:** `create-life-os-app.mjs` 生成 app + 填好的 AppManifest;
`promote-life-os-app.mjs <id>` 按 manifest 接线 siteMeta / launcher(origins+switcher)/
brand accent / design-tokens(brands json + BRAND_APPS + theme exports)/ app.css
品牌 @import / PWA 矩阵 / preview case / 根 scripts / launch.json / netlify.toml /
shell 合同 spec,并跑 build:tokens + validate。仍属手动的外部操作(Netlify site
创建、DNS、图标生成、Supabase env)由脚本结尾清单打印。顺带修复:`BRAND_APPS`
补 `home`(此前 `generated/brands/home.css` 存在但不在构建/校验列表)。

**SHELL.4 遗留:** Music 播放态(mini player 可见 / utility pane / 沉浸
now-playing)的真机运行 QA 待导入曲库后人工验收一次。

---

## C-P2 P2+ 候选

见 [`BACKLOG.md`](./BACKLOG.md) §Platform 提取候选。
