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

| 桶                 | 例子                                  | 默认优先级           |
| ------------------ | ------------------------------------- | -------------------- |
| **Core**           | I-P0 SSO、I-P1.5 事件消费、边界守卫   | 最高——影响多站正确性 |
| **Growth**         | Portal Launcher 体验、跨 app 任务联动 | 中——用户可感知价值   |
| **Infrastructure** | D-P6 a11y、schema.sql 同步、CI 补齐   | 按需——防债累积       |

新条目入 Backlog 前先标桶 + 是否触发「3+ app 重复」规则。
