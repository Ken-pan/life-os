# LifeOS Shared Boundaries

> 跨 Surface 产品系统边界（Web/PWA + future iOS native）
> 关联文档：[`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md), [`LIFEOS_P0_PR_PLAN.md`](./LIFEOS_P0_PR_PLAN.md), [`LIFEOS_CONTRACTS_P0.md`](./LIFEOS_CONTRACTS_P0.md), [`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md)
> 文档入口：[`README.md`](./README.md)

---

## 架构分层

**重要**：`@life-os/contracts` 是依赖图的 **根**，不被任何 shared package 所「支撑」。`@life-os/theme` 与 `@life-os/contracts` **无依赖关系**，二者并行，由不同 consumer 分别引用。

```
@life-os/contracts          ← 根：纯产品契约，无 runtime 依赖
  ↑ consumed by
@life-os/domain             ← contracts only（P1+，P0 仅文档占位）
@life-os/platform-web       ← contracts + theme
@life-os/ui-svelte          ← contracts + theme + platform-web（P1+）
@life-os/ui-react           ← contracts + theme + platform-web（P1+）
future LifeOSKit            ← Swift：镜像 contracts（docs only，P0 不实现）

@life-os/theme              ← Web CSS tokens + web design-system CSS
  ↑ consumed by web surfaces only
@life-os/platform-web
@life-os/ui-svelte
@life-os/ui-react
apps/*                      ← web apps import theme；native 不 import theme

@life-os/sync               ← 独立包；sync 语义类型进 contracts，实现保持独立
  ↑ consumed by apps/*, platform adapters（future）
```

### 依赖方向（Hard Rule — PR 1 必含，CI/review 强制执行）

| Package                                    | 可以依赖                                   | 不能依赖                                            |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| `@life-os/contracts`                       | **nothing**                                | theme, platform-web, domain, ui-\*, apps, sync impl |
| `@life-os/theme`                           | **nothing**（或 package 内部 CSS/JS 模块） | contracts, platform-web, domain, ui-\*, apps        |
| `@life-os/platform-web`                    | contracts, theme                           | domain（P0）, ui-\*, apps                           |
| `@life-os/ui-svelte` / `@life-os/ui-react` | contracts, theme, platform-web             | apps, domain engines                                |
| `@life-os/domain`                          | **contracts only**                         | theme, platform-web, DOM, CSS, Svelte, React        |
| `apps/*`                                   | 所有允许的 shared packages                 | 其他 apps                                           |

**禁止**：

- theme → contracts（或任何 upstream package）
- contracts 内出现 DOM / CSS class / localStorage / browser API
- platform-web 定义产品语义类型（应 import contracts）

---

## Package 职责

### `@life-os/contracts` — cross-surface

- 纯产品契约：数据形状、状态枚举、用户可见 capability 语义
- 无 DOM、无 CSS、无 browser API、无 localStorage
- 设计目标：**可镜像为 Swift struct/enum**（Codable 友好）
- Appearance 语义在 `@life-os/contracts/appearance`；不要命名为 `theme`，避免和 web-only `@life-os/theme` 混淆
- P0 导出清单见 [`LIFEOS_CONTRACTS_P0.md`](./LIFEOS_CONTRACTS_P0.md)

### `@life-os/domain` — domain-only（P1+）

- 纯业务逻辑：校验、格式化、status 映射、recommendation **explanation** 变换
- **仅依赖 contracts**
- P0：只在本文档记录边界，不建 package

### `@life-os/theme` — web-only（CSS + web token 命名）

- Web CSS tokens、design-system.css、ios-safari 平台 CSS
- Token **命名**文档需提供 SwiftUI 映射表（语义参考，非 runtime 依赖）
- **不放**：业务 UI 组件、app 专属 markup、contracts 类型

### `@life-os/platform-web` — web-only runtime

- viewport binding、Safari workaround、IME guard、scroll lock、document meta DOM、localStorage theme store
- **依赖 contracts + theme**（adapter 将 contracts 模型接到 browser API）
- 旧称 `@life-os/platform` **废弃**，一律使用 `@life-os/platform-web`

### `@life-os/ui-svelte` / `@life-os/ui-react` — web-only（P1+）

- 实现 contracts 模型的 web presentation
- P0 **不创建**

### `LifeOSKit` — future native（docs only）

- SwiftUI + iOS platform API
- 消费与 contracts 等价的 Swift 类型
- P0 不创建 Swift / Xcode 工程

### `@life-os/sync` — 独立

- 云同步 transport/merge（当前 web 实现为主）
- `SyncState` / `SyncErrorPresentation` 等 **presentation 语义**在 contracts；merge 逻辑不在 contracts

### `@life-os/finance-enrichment-contract` — Finance-owned parity package

- Finance purchase-enrichment clean/review classification, shared only by the Finance UI and the web-state read-model builder
- Not a cross-surface LifeOS shared-platform package
- Does not loosen the P1 rule that only Planner and Fitness may consume `@life-os/contracts` / `@life-os/platform-web`
- Keep ledger/reconciliation/purchase matching flows app-owned; this package only centralizes duplicated display classification rules

---

## API 分类标签

每条 shared API 必须标注其一：

| Tag             | 含义                            |
| --------------- | ------------------------------- |
| `cross-surface` | Web + iOS 可共用产品语义        |
| `web-only`      | 浏览器/PWA/DOM/CSS/localStorage |
| `domain-only`   | 纯逻辑，无 I/O                  |
| `app-only`      | 单平台业务，不进入 shared layer |

**规则**：

- 碰 `document` / `window` / `HTMLElement` / `localStorage` / CSS class / browser events → **`web-only`**
- 产品含义、状态、用户动作语义 → **`cross-surface`** → 放 contracts
- contracts **禁止** import platform-web 或 theme JS

---

## Do-not-abstract list

| 类别           | 项                                                                   | Tag                             |
| -------------- | -------------------------------------------------------------------- | ------------------------------- |
| Planner        | Task / recurrence / schedule engine                                  | app-only                        |
| Finance        | ledger / reconciliation / purchase matching                          | app-only                        |
| Music          | player / queue / now-playing / RPC scoring                           | app-only                        |
| Fitness        | Focus session / coach / progression                                  | app-only                        |
| All            | recommendation **scoring**                                           | app-only                        |
| All            | TaskRow / TxnRow / TrackRow / ExerciseRow                            | app-only                        |
| Web            | IME guard, scroll lock, viewport, CSS classes                        | web-only                        |
| Storage        | Dexie, localStorage keys, IndexedDB API                              | web-only                        |
| Transport      | Netlify AI proxy, Chrome extension capture                           | web-only                        |
| P1+            | Settings markup 四端统一                                             | web-only                        |
| P0 禁止 export | WidgetSnapshot, LiveActivitySession, PlaybackState, HealthKit models | docs only → 见 NATIVE_READINESS |

---

## React / Svelte dual-stack

- P0：仅 `contracts` + `platform-web` scaffold；**不**创建 ui-svelte/ui-react
- P0：**不迁移任何 app 组件**（含 SyncErrorBanner）
- App 内组件保留；P1+ 新组件接受 contracts model 为 props
- Finance / TS：只能 `import type` from contracts；Svelte / JS：只能 JSDoc `@typedef {import('@life-os/contracts/...').SomeType}` 镜像；禁止 runtime value import contracts

---

## Migration safety rules

1. **Docs before behavior** — PR 1 边界文档先于 package scaffold
2. **Add-only P0** — 不删、不改名 app 内组件
3. **No app pilot in P0** — PR 5（First app pilot）属于 **P1**，不进 P0
4. **No DB / Supabase / migration** in P0 PRs
5. **Rollback** — 每个 PR 独立 revert；P0 packages 未被 app import 前零运行时风险
6. **Dependency lint** — 新增 package 必须在 README 声明上表依赖方向
7. **Boundary guard** — PR 2 必须新增 `scripts/check-lifeos-boundaries.mjs` 和 `npm run check:lifeos-boundaries`，验证 contracts/theme/platform-web dependency direction 与 contracts type-only usage

---

## 相关文件

- P0 契约类型：[`LIFEOS_CONTRACTS_P0.md`](./LIFEOS_CONTRACTS_P0.md)
- Native 机会与 future types：[`LIFEOS_NATIVE_READINESS.md`](./LIFEOS_NATIVE_READINESS.md)
- PR 计划：[`LIFEOS_P0_PR_PLAN.md`](./LIFEOS_P0_PR_PLAN.md)
- P1 pilot 准备：[`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md)
- UI presentation map：[`LIFEOS_UI_CONTRACTS.md`](./LIFEOS_UI_CONTRACTS.md)
