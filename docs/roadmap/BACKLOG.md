# Roadmap Backlog & 架构守卫

评估新共享提取、排期前读本文。Hub 优先级见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now / §Not doing。

---

## Package 依赖方向（Hard Rule）

| Package        | 可依赖                                       | 不可依赖                                     |
| -------------- | -------------------------------------------- | -------------------------------------------- |
| `contracts`    | _nothing_                                    | `theme`, `platform-web`, `apps`, `sync` impl |
| `theme`        | 内部                                         | `contracts`, `platform-web`, `apps`          |
| `platform-web` | `contracts`, `theme`                         | `apps`, `domain`                             |
| `apps/*`       | `contracts`, `platform-web`, `sync`, `theme` | 其他 `apps`                                  |

CI：`npm run check:lifeos-boundaries`

---

## 提取决策矩阵

```text
重复 ≥3 app 且逻辑相同      → sync / platform-web / theme
重复 2 app 且 envelope 同构  → 参数化工厂（localCache、backup）
Svelte + Finance React       → theme/brand 数据 + 各栈薄壳；或 ui-react
业务表 / nav / sync 引擎     → 永不提取（app-only）
跨 app 业务联动              → life_events + contracts（Integration）
```

---

## Platform 提取候选

### P2 — 需栈决策（暂缓）

| 候选                               | 阻塞                          | 方向                                         |
| ---------------------------------- | ----------------------------- | -------------------------------------------- |
| Finance SyncErrorBanner / Settings | 无 React 共享 UI 包           | `@life-os/ui-react` 或 presentation 逻辑共用 |
| Finance i18n                       | React Context vs `createI18n` | `createI18nCore` 或保持独立                  |
| Finance backup                     | 无 settings 导出流            | 复用 `platform-web/backup` envelope          |
| `schema.sql` ↔ migrations          | 运维债                        | `core_*` merge（`life_events` 已同步）       |

### P3 — 明确暂缓

| 候选                          | 原因                  |
| ----------------------------- | --------------------- |
| `sw.js` / serviceWorker       | 各 app 缓存策略分化   |
| `BottomNav` / `AppBar` 整组件 | 2–3 app；强绑定业务   |
| `SideNav` / `ListSidebar`     | 结构似、语义异        |
| `@life-os/domain`             | 无纯函数重复达阈值    |
| `@life-os/ui-svelte` 聚合包   | Wave 2 子路径直出已够 |

---

## 不提取（do-not-abstract）

各 app **`sync.js` 引擎**（表语义不同）、**`nav.js` 内容**、**`state.svelte.js`**、**`iconRegistry.js` 图标集**（仅共享 context key）、**`supabaseTables.js`**、recommendation scoring、业务行级 UI（TaskRow / TxnRow / TrackRow）。

---

## 已共享薄包装（勿误提取）

| App 文件                   | 实际来源                                 | 说明                                |
| -------------------------- | ---------------------------------------- | ----------------------------------- |
| `*/lib/supabase.{js,ts}`   | `createLifeOsSupabaseClient`             | Finance `productionFallback: false` |
| `*/lib/syncNotify.{js,ts}` | `createSyncNotify` + app i18n            | 文案留 app                          |
| `*/lib/scrollLock.js`      | re-export `@life-os/theme`               | 可改直 import                       |
| `*/lib/backup.js`          | `platform-web/backup` + app `applyState` | 数据组装留 app                      |

---

## 单人排期启发式

三类工作桶（参考 indie roadmap 实践）：

| 桶                 | 例子                                            | 默认优先级           |
| ------------------ | ----------------------------------------------- | -------------------- |
| **Core**           | INTG.IDENTITY.0 SSO、INTG.EVENTS.1.5 事件消费、边界守卫             | 最高——影响多站正确性 |
| **Growth**         | Portal Launcher、Home 实验入口、跨 app 任务联动 | 中——用户可感知价值   |
| **Infrastructure** | DSGN.CATALOG.6 a11y、schema.sql 同步、CI 补齐             | 按需——防债累积       |

新条目入 Backlog 前先标桶 + 是否触发「3+ app 重复」规则。

---

## Growth 候选（2026-07-08 调研入库）

Hub §Next 已排期。细节与外部对标 → [`GROWTH.md`](./GROWTH.md)。

| ID      | 主题                              | ROI | 投入   | 依赖                       |
| ------- | --------------------------------- | --- | ------ | -------------------------- |
| PORT.GROWTH.1    | Portal 继续 → DB `last_opened_at` | 🔥  | 0.5–1d | INTG.EVENTS.1 DB                    |
| PORT.GROWTH.3    | `default_app` 跳转                | 🔥  | 0.5d   | INTG.EVENTS.1 DB                    |
| PORT.GROWTH.2    | 待办 / 事件角标                   | ◆   | 1–2d   | INTG.IDENTITY.0 SSO                   |
| MUSC.CORE.1    | Music `play_events` + reasons     | ◆   | 1–1.5d | —                          |
| FINC.GROWTH.1    | Finance 扩展同步反馈              | ◆   | 1–2d   | —                          |
| PORT.GROWTH.5    | PWA 安装引导（六站含 Home）       | ○   | 1–2d   | —                          |
| HOME.PORTAL.1    | Portal Home 实验卡                | ✅  | —      | `PORTAL_APPS` 实验区       |
| HOME.SSO.2    | Home `coreIdentity` + SSO         | ✅  | —      | `createLifeOsAuth('home')` |
| HOME.SSO.3    | Home redirect + DB `home`         | ✅  | HOME.SSO.2   | migration `20260708180000` |
| PORT.GROWTH.4    | 今日摘要卡片                      | ✅  | —      | migration `20260708190000` |
| INTG.EVENTS.1b | Fitness → Planner 事件            | ○   | 3–5d   | 产品规则                   |

Tier B（未进 hub §Next）：PORT.GROWTH.6、FINC.CORE.2、MUSC.PIPE.3、PLNR.CORE.1、**HOME.PROJ.4** spatial 云同步。（**HOME.PROJ.5** 平面浏览/编辑 ✅ 2026-07-08）

---

## 推荐执行顺序（与 hub · POTENTIAL 同步）

| Phase    | 项                                     | 桶                | ROI |
| -------- | -------------------------------------- | ----------------- | --- |
| **0**    | **FINC.CORE.3**                               | Core              | 🔥  |
| **1**    | PORT.GROWTH.4b-M · MUSC.UI.2 · PLNR.CORE.2                  | Growth/Infra/Core | ◆   |
| **1b**   | CI 接线（FINC.CORE.0/PLNR.CORE.2 本地 ✅）          | Infra             | ◆   |
| **3**    | INTG.EVENTS.1b/GYMS.EVENTS.1 · PORT.GROWTH.4b-H                | Growth            | ○   |
| **按需** | DSGN.CATALOG.7 a11y；各 app §Parked              | Infra/Product     | ○   |
| **暂缓** | Finance `ui-react` / nav mirror / i18n | Platform          | ✗   |

**2026-07-09 已完成：** FINC.CORE.0 · PLNR.CORE.2 · INTG.IDENTITY.0 · PORT.GROWTH.4 · HOME.PORTAL.1/HOME.SSO.2/HOME.SSO.3 · FINC.GROWTH.1 · PORT.GROWTH.2 · MUSC.CORE.1 · AppBrandSwitcher — 见 [`SHIPPED.md`](./SHIPPED.md)。

## 六 app 产品候选（2026-07-09 脑暴入库）

Hub §Next 已收录 🔥/◆ 项。完整表 → [`apps/README.md`](./apps/README.md)。

| App     | Top IDs          | 分卷                                   |
| ------- | ---------------- | -------------------------------------- |
| Planner | PLNR.CORE.2, PLNR.CORE.3       | [`apps/planner.md`](./apps/planner.md) |
| Fitness | GYMS.CORE.0, GYMS.EVENTS.1     | [`apps/fitness.md`](./apps/fitness.md) |
| Finance | FINC.CORE.3, FINC.SYNC.1b      | [`apps/finance.md`](./apps/finance.md) |
| Music   | MUSC.UI.2, MUSC.PIPE.4, MUSC.PIPE.5 | [`apps/music.md`](./apps/music.md)     |
| Portal  | PORT.GROWTH.4b, PORT.GROWTH.6      | [`apps/portal.md`](./apps/portal.md)   |
| Home    | HOME.PROJ.6a, HOME.PROJ.7      | [`apps/home.md`](./apps/home.md)       |
