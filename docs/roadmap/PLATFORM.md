# Platform 主线（C-\*）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。

---

## C-P0 & C-P1 — 已完成

| 子项                                                   | 状态 |
| ------------------------------------------------------ | ---- |
| `@life-os/contracts`（7 type-only + `events` runtime） | ✅   |
| `@life-os/platform-web`                                | ✅   |
| `npm run check:lifeos-boundaries`                      | ✅   |
| Planner / Fitness P1A/B/C                              | ✅   |

---

## C-P1+: 平台扩容 — 低优先级（暂缓大项）

> **ROI 评审（2026-07-08）：** `contracts/events` 已接；Finance React 共享 UI / nav mirror **移出 §Now**，见 hub §Next ✗。仅 Finance 一个 React 栈时不做 `ui-react`。

| App     | contracts  | platform-web                 | 备注                                                                  |
| ------- | ---------- | ---------------------------- | --------------------------------------------------------------------- |
| Planner | ✅ mirrors | ✅ meta + i18n               | 试点完成                                                              |
| Fitness | ✅ mirrors | ✅ meta + i18n               | 试点完成                                                              |
| Finance | 🟡 events  | 🟡 部分                      | enrichment-contract；`createLifeOsAuth` / `localCache` / theme 已共享 |
| Music   | ✅ mirrors | ✅ i18n + AppBrand           | nav 内容 app-owned                                                    |
| Portal  | ✅ dep     | ✅ CommandPalette + AppBrand | CI build ✅                                                           |
| Home    | ✅ dep     | ✅ 部分                      | 实验；未 deploy                                                       |

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
| **3 P0**       | 2026-07-08 | PortraitGate、localCache、Portal AppBrand                                    |
| **3 P1+**      | 2026-07-08 | MobileMoreSheet、Portal auth、Music contracts、Finance events、Planner inbox |

Wave 逐表证据 → [`SHIPPED.md`](./SHIPPED.md) §Platform

---

## C-P2 P2+ 候选

见 [`BACKLOG.md`](./BACKLOG.md) §Platform 提取候选。
