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

**反向规则 —— 单 app 私有壳层不进 `packages/theme`（2026-07-14 立）：** 共享包只放
**≥2 个 app 真正共用**的样式。踩过的坑：`music-shell.css`（5601 行、选择器全是
`.music-app` / `.now-playing-*` / `.mini-player-*` 等 music 专属、消费者只有 music
一个）从初始 commit 起就躺在 `packages/theme`，占了共享 theme **59%** 的体量，
谁维护 theme 都得先趟过它 —— 已迁回 `apps/music/src/music-shell.css`（theme
9442→3841 行）。**判据：数一下消费者；只有 1 个就该放回那个 app。**

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

## Growth 候选（历史入库 · 多数已发）

> **真源：** hub §Now / §Shipped · [`POTENTIAL.md`](./POTENTIAL.md)。下表只留档，**勿当待办。**

| ID      | 主题                              | 状态 |
| ------- | --------------------------------- | --- |
| ~~PORT.GROWTH.1~~    | Portal 继续 → DB `last_opened_at` | ✅ |
| ~~PORT.GROWTH.3~~    | `default_app` 跳转                | ✅ |
| ~~PORT.GROWTH.2~~    | 待办 / 事件角标                   | ✅ |
| ~~MUSC.CORE.1~~    | Music `play_events` + reasons     | ✅ |
| ~~FINC.GROWTH.1~~    | Finance 扩展同步反馈              | ✅ |
| ~~PORT.GROWTH.5~~    | PWA 安装引导（六站含 Home）       | ✅ |
| ~~HOME.PORTAL.1~~    | Portal Home 实验卡                | ✅ |
| ~~HOME.SSO.2~~    | Home `coreIdentity` + SSO         | ✅ |
| ~~HOME.SSO.3~~    | Home redirect + DB `home`         | ✅ |
| ~~PORT.GROWTH.4~~    | 今日摘要卡片                      | ✅ |
| ~~INTG.EVENTS.1b~~ | Fitness → Planner 事件            | ✅ |

Tier B：`HOME.SYNC.4` / `HOME.RECOG.0` 已闭环；**HOME.PROJ.4** 完整可编辑 spatial 项目同步仍后移。

---

## 推荐执行顺序（与 hub · POTENTIAL 同步 · 2026-07-18 Phase 8）

| Phase    | 项                                     | 桶                | ROI |
| -------- | -------------------------------------- | ----------------- | --- |
| **✅ 1–8** | MCP 舰队 · 深链 · 角标 · DOCS.2 · KnowledgeNoteLinks · **终局 Done when** | Core/Growth/Infra | — |
| **Ken** | AIOS/Portal 验收 · SCHED/CAPTURE · HLT-5 ·（可选）装 HA→DEVICE.12 | Gate | 🔥 |
| **Agent** | KNOW.VAULT.0 rebuild 验收 · USAGE 本机探针 | Infra | ◆ |
| **条件** | object_ref（痛点）· Status 契约（HLT-5 后） | Core | ○ |
| **暂缓** | IMPORT.5 · 多项目云同步 · INTG.EVENTS.2 | Product | ✗ |

历史 Phase 0–3 见 [`SHIPPED.md`](./SHIPPED.md)。终局条款 → [`apps/`](./apps/README.md) §终局。

## 产品候选（2026-07-18 · Phase 8）

Hub：**工程主航道空 / 产品主线 = 验收+真源**。完整排序 → [`POTENTIAL.md`](./POTENTIAL.md) · [`apps/README.md`](./apps/README.md)。

| App     | Top IDs          | 分卷                                   |
| ------- | ---------------- | -------------------------------------- |
| Planner | SCHED/CAPTURE gate | [`apps/planner.md`](./apps/planner.md) |
| Fitness | maintenance；MCP ✅ | [`apps/fitness.md`](./apps/fitness.md) |
| Finance | Ken 日用验收；IMPORT.5 ○ | [`apps/finance.md`](./apps/finance.md) |
| Music   | paused；PIPE.4 问题触发 | [`apps/music.md`](./apps/music.md) |
| Portal  | maintenance；不硬凑卡 | [`apps/portal.md`](./apps/portal.md) |
| Home    | DEVICE.12（需 HA）；MCP.13 ✅ | [`apps/home.md`](./apps/home.md) |
| AIOS    | 日用三问验收；舰队 ✅ | [`apps/aios.md`](./apps/aios.md) |
| KnowledgeOS | VAULT.0 验收；object_ref 按需 | [`apps/knowledge.md`](./apps/knowledge.md) |
| HealthOS | HLT-5 gate | [`apps/health.md`](./apps/health.md) |
