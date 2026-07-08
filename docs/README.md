# Life OS Docs

Canonical documentation index for the Life OS monorepo.

**最后与代码同步：** 2026-07-08（对照远程 Supabase + 工作区核实；含 C-P2 提取候选审计）

## 当前状态速览

图例：✅ 完成 · 🟡 部分 / WIP · ❌ 未做 · ⏸️ 搁置

| 主线        | 阶段                 | 状态 | 说明                                                                        |
| ----------- | -------------------- | ---- | --------------------------------------------------------------------------- |
| Integration | I-P0 身份            | 🟡   | 远程 `core_profiles` ✅；四站 hooks ✅；SSO 跨域待 E2E 验收                 |
| Integration | I-P1 Portal          | 🟡   | `apps/portal` WIP；Netlify `portal-ken` 已部署                            |
| Integration | I-P1.5 events        | 🟡   | 远程 `life_events` + Outbox ✅；Planner inbox processor ✅；Zod envelope ✅ |
| Integration | I-P2 智能            | ⏸️   | 搁置                                                                        |
| Platform    | C-P0 边界/契约包     | ✅   | `check:lifeos-boundaries` 通过                                              |
| Platform    | C-P1 Planner/Fitness | ✅   | P1A/B/C 完成                                                                |
| Platform    | C-P1+ Finance/Music  | 🟡   | Finance enrichment-contract；Music contracts mirror ✅                      |
| Platform    | C-P2 Wave 3 P1+      | ✅   | MobileMoreSheet / Portal auth / events envelope / Planner inbox             |

详见 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) 完成度总览、**§C-P2 Wave 3 提取候选**与决策矩阵。

验收：`./scripts/verify-life-os-identity-p0.sh` · `./scripts/test-outbox-trigger.sh --smoke` · `npm run check:lifeos-boundaries` · E2E 见 [`E2E_ISSUES.md`](./E2E_ISSUES.md)

## 计划文档（两条主线）

| 主线       | 文档                                       | 说明                                                      |
| ---------- | ------------------------------------------ | --------------------------------------------------------- |
| **Global** | `[LIFEOS_ROADMAP.md](./LIFEOS_ROADMAP.md)` | 融合了 Integration 与 Platform 的最新架构路线图与阶段规划 |

**命名：** `I-*` = Integration；`C-*` = Contracts/Platform。

| 参考                                                         | 用途                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| `[LIFEOS_CONTRACTS.md](./LIFEOS_CONTRACTS.md)`               | 契约白名单（源码 `packages/contracts/src/`） |
| `[LIFEOS_NATIVE_READINESS.md](./LIFEOS_NATIVE_READINESS.md)` | Future iOS 矩阵                              |
| `[SUPABASE.md](./SUPABASE.md)`                               | 共享 DB 迁移、SQL 运维、平台 migration 状态  |

## 运维与开发

| Doc                                                | Purpose                                  |
| -------------------------------------------------- | ---------------------------------------- |
| `[CANONICAL.md](./CANONICAL.md)`                   | Source-of-truth repo vs archived legacy  |
| `[NETLIFY.md](./NETLIFY.md)`                       | 四站 deploy + Portal 计划 + env vars     |
| `[SUPABASE.md](./SUPABASE.md)`                     | 远程 SQL、平台 migration、Auth redirect  |
| `[E2E_ISSUES.md](./E2E_ISSUES.md)`                 | 四 App E2E/QA 跑批问题记录（2026-07-08） |
| `[INPUT_IME.md](./INPUT_IME.md)`                   | CJK IME guard                            |
| `[CURSOR_PAGE_BRIDGE.md](./CURSOR_PAGE_BRIDGE.md)` | Web State DevTools                       |
| `[LEGACY_LOCAL.md](./LEGACY_LOCAL.md)`             | Removed sibling repo paths               |

## Packages

| Package                                | Doc                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `@life-os/contracts`                   | `[../packages/contracts/README.md](../packages/contracts/README.md)`       |
| `@life-os/platform-web`                | `[../packages/platform-web/README.md](../packages/platform-web/README.md)` |
| `@life-os/sync`                        | `[../packages/sync/README.md](../packages/sync/README.md)`                 |
| `@life-os/theme`                       | `[../packages/theme/README.md](../packages/theme/README.md)`               |
| `@life-os/finance-enrichment-contract` | Finance-owned purchase 展示分类（**非**平台包）                            |

## 共享提取与边界

- **路线图 + 候选清单：** [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §C-P2（Wave 1–2.5 已完成，Wave 3 待办）
- **契约白名单：** [`LIFEOS_CONTRACTS.md`](./LIFEOS_CONTRACTS.md)
- **历史边界细则：** [`archive/LIFEOS_SHARED_BOUNDARIES.md`](./archive/LIFEOS_SHARED_BOUNDARIES.md)
- **Repo 级脚本（非 npm 包）：** `scripts/pwa/*`（五端 PWA QA）、`scripts/check-lifeos-boundaries.mjs`、`scripts/verify-life-os-identity-p0.sh`

## Apps

- `[../apps/planner/README.md](../apps/planner/README.md)` — contracts 试点 + I-P0
- `[../apps/fitness/README.md](../apps/fitness/README.md)` — contracts 试点 + I-P0
- `[../apps/finance/README.md](../apps/finance/README.md)` — I-P0 + Supabase canonical 源（见 [`docs/SUPABASE.md`](./SUPABASE.md)）
- `[../apps/music/README.md](../apps/music/README.md)` — I-P0；无 contracts
- `[../apps/portal/README.md](../apps/portal/README.md)` — I-P1 WIP（未部署）

`apps/*/docs`、exports、QA 截图为 app 证据，非计划真源。

## Archive

`[archive/README.md](./archive/README.md)` — 已合并的旧规划文档
