# Life OS Platform（共享包与契约）

> **主线 C-P0 / PLAT.CONTRACTS.1：** contracts、`@life-os/platform-web`、边界守卫
> **并行 Integration：** [`LIFEOS_INTEGRATION.md`](./LIFEOS_INTEGRATION.md)（INTG.IDENTITY.0 身份在 `@life-os/sync`）

**最后与代码同步：** 2026-07-08（`check:lifeos-boundaries` ✅）

---

## 状态

| 阶段      | 内容                                             | 代码状态       |
| --------- | ------------------------------------------------ | -------------- |
| **C-P0**  | contracts 包、platform-web、boundary guard、文档 | ✅             |
| **PLAT.CONTRACTS.1**  | Planner + Fitness 试点 P1A/B/C                   | ✅             |
| **PLAT.CONTRACTS.1+** | Finance/Music 接 contracts、shared UI            | ❌ 未批准/未做 |

**验证：**

```bash
npm run check && npm run build
npm run check:lifeos-boundaries
npm run test -w @life-os/platform-web
npm run test -w planner-os -- src/lib/syncErrorPresentation.test.js
node apps/fitness/scripts/sync-error-presentation-check.mjs
```

---

## 架构分层

`@life-os/contracts` 是依赖图 **根**；`@life-os/theme` 与 contracts **无依赖**。
`@life-os/sync` **独立**（含 INTG.IDENTITY.0 身份辅助函数，见 Integration 文档）。

```
@life-os/contracts     ← 根：packages/contracts/src/*.d.ts
  ↑
@life-os/platform-web  ← packages/platform-web（applyDocumentMetaWeb 等）
@life-os/ui-*          ← 未建

@life-os/theme         ← packages/theme
@life-os/sync          ← packages/sync（auth + sync transport + coreIdentity）

apps/*                 ← 禁止互引
```

### 依赖方向（Hard Rule）

| Package        | 可依赖           | 不可依赖                             |
| -------------- | ---------------- | ------------------------------------ |
| `contracts`    | nothing          | theme, platform-web, apps, sync impl |
| `theme`        | 内部             | contracts, platform-web, apps        |
| `platform-web` | contracts, theme | apps, ui-\*, domain                  |
| `apps/*`       | 允许的 shared    | 其他 apps                            |

**CI：** `scripts/check-lifeos-boundaries.mjs` → `npm run check:lifeos-boundaries`

---

## Package 职责

| 包                            | 路径                                   | 说明                                                                 |
| ----------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| `contracts`                   | `packages/contracts`                   | 纯 `.d.ts`；模块 appearance/meta/sync/nav/content/feedback           |
| `platform-web`                | `packages/platform-web`                | Web adapter；Planner/Fitness 已用 `applyDocumentMetaWeb`             |
| `theme`                       | `packages/theme`                       | Web CSS；四 app 均依赖                                               |
| `sync`                        | `packages/sync`                        | 云同步 + **INTG.IDENTITY.0** `resolveSupabaseEnv` / `createCoreIdentityHandler` |
| `finance-enrichment-contract` | `packages/finance-enrichment-contract` | Finance 专用；非 cross-surface 平台包                                |

---

## PLAT.CONTRACTS.1 试点（Planner + Fitness）

**依赖声明：** 仅 `planner-os`、`fitness-os` 的 `package.json` 含 `@life-os/contracts` 与 `@life-os/platform-web`。

| 步骤               | 实现位置                                                                 | 状态 |
| ------------------ | ------------------------------------------------------------------------ | ---- |
| **P1A** type-only  | `apps/*/src/lib/types.js`、`state.svelte.js`（JSDoc typedef）            | ✅   |
| **P1B** metadata   | `apps/*/src/lib/components/DocumentHead.svelte` → `applyDocumentMetaWeb` | ✅   |
| **P1C** sync error | `apps/*/src/lib/syncErrorPresentation.js` + `SyncErrorBanner.svelte`     | ✅   |

**未接入 contracts 的 app：**

| App     | 说明                                                           |
| ------- | -------------------------------------------------------------- |
| Finance | React；用 `finance-enrichment-contract`；INTG.IDENTITY.0 身份已接         |
| Music   | 仅用 `@life-os/sync` + `@life-os/theme`；Dexie 同步 app 内自建 |

**规则：** 禁止 runtime value-import contracts；不迁 SyncErrorBanner；PLAT.CONTRACTS.1 不做 Supabase schema 变更（INTG.IDENTITY.0 身份迁移属 Integration 主线，与 PLAT.CONTRACTS.1 并行）。

**扩容门槛：** boundary guard 通过 + 行为不变 + 单独批准 → 再扩 Finance/Music。

---

## Do-not-abstract（节选）

| 类别    | 项                     | Tag      |
| ------- | ---------------------- | -------- |
| Planner | task/recurrence engine | app-only |
| Finance | ledger/reconciliation  | app-only |
| Music   | player/scoring/RPC     | app-only |
| Fitness | coach/progression      | app-only |
| Web     | IME guard, Dexie keys  | web-only |

完整矩阵：[`LIFEOS_NATIVE_READINESS.md`](../LIFEOS_NATIVE_READINESS.md)

---

## 类型与 UI 映射

- **契约白名单：** [`LIFEOS_CONTRACTS.md`](../LIFEOS_CONTRACTS.md)（源码 `packages/contracts/src/`）
- **iOS future：** [`LIFEOS_NATIVE_READINESS.md`](../LIFEOS_NATIVE_READINESS.md)

---

## Rollback（PLAT.CONTRACTS.1）

移除试点 app 的 typedef/adapter 引用；保留 packages；重跑 boundary guard。

---

_历史 PR 逐条计划：`archive/LIFEOS_P0_PR_PLAN.md`_
