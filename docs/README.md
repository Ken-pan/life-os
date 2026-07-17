# Life OS Docs

> **导航 hub** — 按「时间层 + 职责」组织。状态与优先级只看 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md)。

**最后核对：** 2026-07-17 ROI / 闭环深查（九 app 代码 + 测试 + 远程 schema + 未提交 WIP + CI）· 维护约定见 [`MAINTENANCE.md`](./MAINTENANCE.md)

## 当前优先级（摘要）

**模型：** 生产/版本史完整性 → 收割已完成代码 → 每日体感 → 防回归 → 窄跨站快赢 — 详见 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §推荐执行顺序

| 焦点 | 主题                                                                     | 文档                                                             |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Now  | **PLAT.CI.0** · **HOME.RECOG.0** · **FINC.PURCHASE.6.a closure** · **KNOW.EDITOR.7** | [`roadmap/AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md) |
| Next | KNOW.VAULT.0 · HOME.RECOG.1 · AIOS.STABLE.26 · HOME.MCP.13 | [`roadmap/apps/`](./roadmap/apps/README.md) |
| User gate | PLNR.SCHED.10b.ios · PLNR.CAPTURE.0 · HLT-5 | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) |

**2026-07-16 / 07-15 已验收：** DS 平台化（品牌 7 站 · Overlay/Form/Nav 骨架 · 像素基线扩容 · Toast 重做）— 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)
**2026-07-16 已落地（代码事实）：** HealthOS HLT-0–4 · KnowledgeOS 项目感知与 Planner 双向引用 · Home 扫描/照片/事件生产链与空间智能 P0 — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)
**2026-07-17 已落地：** 图表品牌色板/可读性打磨 · Design Catalog 覆盖九品牌 — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

> **CI 事实（2026-07-17）：** master 最近 5 次 push 挂在 `integration-smoke` 的 `check:lifeos-styles`（已提交的 Home 提交超样式基线）；`check:app-manifests` 的注册表漂移同期存在。两者已在工作区修复（重生成 `appRegistry.js` + 基线 `--update` 收编），推送后应复绿；细节见 [`roadmap/APP_GENERATOR.md`](./roadmap/APP_GENERATOR.md) 与 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) 代码状态快照。
**2026-07-14 已验收：** AIOS.20–25 跨 app 打通 · GYMS.VOL.6/6a · GYMS.READY.8/WARMUP.9 · Finance payment_day · Music 推荐闭环 · 全线 DS 走查收敛 — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)
**2026-07-13 已验收：** GYMS.SUB.5 收割 · PLNR.SCHED.0 E2E 复绿 · FINC.SYNC.1b · PLNR.CORE.4 — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)
**2026-07-09 已验收：** Phase 0–6 批次（PORT.GROWTH.4b-H / HOME.PROJ.6a · Portal UI 走查 P-1–P-12 等）— 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

> **协作模型（2026-07-12 起）：** 单分支，无 agent 专属 worktree — 见 [`AGENTS.md`](../AGENTS.md) §Git policy · 执行分线 [`roadmap/AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md)

**九 app 分卷（六部署 web + AIOS + KnowledgeOS + HealthOS）：** [`roadmap/apps/`](./roadmap/apps/README.md) · **潜力研判：** [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md) · **愿景：** [`architecture/NORTH_STAR.md`](./architecture/NORTH_STAR.md)

## 九 app + 插件（一览）

| App / 插件                          | 层级                  | 文档                                                                       |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Planner · Fitness · Finance · Music | 生产四站              | [`roadmap/apps/`](./roadmap/apps/README.md)                                |
| Portal                              | 启动器                | [`roadmap/apps/portal.md`](./roadmap/apps/portal.md)                       |
| Home                                | 实验第六站（web）     | [`roadmap/apps/home.md`](./roadmap/apps/home.md)                           |
| AIOS                                | 实验第七站（本地优先，原生 Mac app） | [`roadmap/apps/aios.md`](./roadmap/apps/aios.md)             |
| KnowledgeOS                         | 实验第八站（本地优先，原生 Mac app） | [`roadmap/apps/knowledge.md`](./roadmap/apps/knowledge.md)   |
| HealthOS                            | 实验第九站（本地优先，Mac + Watch/iPhone companion） | [`roadmap/apps/health.md`](./roadmap/apps/health.md) |
| Finance OS Sync                     | Chrome 扩展（非 app） | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md#f-p1) · `apps/finance/extension` |

> `design-catalog` / `starter` 是平台工具，不计入产品 app；PaperOS 是第十个概念 OS，但设备 Shell 已迁出 → [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)。

## 文档地图（单人团队四层）

| 层                 | 目录 / 文件                                                                    | 回答什么问题                     |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------- |
| **Future + Now**   | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) + [`roadmap/`](./roadmap/README.md) | 做什么、不做什么、发货记录       |
| **Present · 运维** | [`ops/`](./ops/README.md)                                                      | 怎么部署、连哪库、以谁为准       |
| **Present · 架构** | [`architecture/`](./architecture/README.md)                                    | 愿景、体系快照、契约、事件、Native |
| **Present · 质量** | [`qa/`](./qa/README.md)                                                        | E2E、PWA、IME、截图证据          |
| **Tooling**        | [`tooling/`](./tooling/README.md)                                              | Cursor / DevTools 集成           |
| **Past**           | [`archive/`](./archive/README.md)                                              | 已合并的旧规划（勿在新 PR 引用） |
| **Assets**         | [`assets/`](./assets/README.md)                                                | 品牌 SVG / icon manifest         |

```text
docs/
├── LIFEOS_ROADMAP.md    ← 每周扫一眼（Now / Next / Shipped / Not doing / App 一览）
├── MAINTENANCE.md       ← 怎么维护这套文档
├── roadmap/             ← 分卷：INTEGRATION · GROWTH · PLATFORM · DESIGN · BACKLOG · SHIPPED · apps/
├── ops/                 ← Netlify · Supabase · canonical
├── architecture/        ← NORTH_STAR · SYSTEM_OVERVIEW · contracts · events-rfc · …
├── qa/                  ← e2e · pwa · PLNR.SCHED.0 baseline（PaperOS gates → 独立仓库）
├── tooling/             ← cursor-page-bridge
├── assets/              ← life-os-logos
├── ui-qa-screenshots/   ← QA 脚本输出（证据，非计划真源）
└── archive/             ← 历史规划
```

## 快速入口

| 我要…                              | 打开                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| 看当前在做什么                     | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §Now · §推荐执行顺序                                |
| 看 App 一览状态                    | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §App 一览                                           |
| 看北极星愿景                       | [`architecture/NORTH_STAR.md`](./architecture/NORTH_STAR.md)                                   |
| 看体系架构快照                     | [`architecture/SYSTEM_OVERVIEW.md`](./architecture/SYSTEM_OVERVIEW.md)                         |
| 看单 app 排期                      | [`roadmap/apps/`](./roadmap/apps/README.md)                                                    |
| 看 ROI 研判                        | [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)                                               |
| 部署 / env / Web surfaces          | [`ops/netlify.md`](./ops/netlify.md)                                                           |
| Growth 排期与外部对标              | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                                                     |
| 跑远程 SQL / migration             | [`ops/supabase.md`](./ops/supabase.md)                                                         |
| 确认 canonical repo                | [`ops/canonical.md`](./ops/canonical.md)                                                       |
| 查 contracts 白名单                | [`architecture/contracts.md`](./architecture/contracts.md)                                     |
| 查响应式 / 页眉契约                | [`architecture/responsive-chrome.md`](./architecture/responsive-chrome.md)                     |
| 查 life_events 格式                | [`architecture/events-rfc.md`](./architecture/events-rfc.md)                                   |
| 调试 iOS PWA                       | [`qa/pwa-ios.md`](./qa/pwa-ios.md)                                                             |
| Planner 日程 baseline（PLNR.SCHED.0） | [`qa/planner-schedule-antigravity-baseline.md`](./qa/planner-schedule-antigravity-baseline.md) |
| PaperOS（独立仓库）                | [`roadmap/apps/paperos.md`](./roadmap/apps/paperos.md)                                        |
| 看 E2E 失败记录                    | [`qa/e2e-issues.md`](./qa/e2e-issues.md)                                                       |
| Portal UI 截图走查（P-1–P-12 ✅）  | [`qa/portal-screenshot-audit.md`](./qa/portal-screenshot-audit.md)                             |

## 验收命令（hub 级）

```bash
./scripts/verify-life-os-identity-p0.sh
./scripts/test-outbox-trigger.sh --smoke
npm run check:lifeos-boundaries
npm run check:app-manifests
npm run test:design-catalog              # smoke
npm run test:design-catalog:a11y         # catalog a11y gates
npm run test:design-catalog:snapshots    # pixel baselines
```

## Packages & Apps

| 类型          | 文档位置                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| 共享包        | `packages/{contracts,sync,theme,platform-web,design-tokens,mcp-server}/README.md` |
| 生产 + Portal | `apps/{planner,fitness,finance,music,portal}/README.md`                  |
| Home 实验     | `apps/home/` · [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0) |
| AIOS 实验     | `apps/aios/README.md` · [`roadmap/apps/aios.md`](./roadmap/apps/aios.md) |
| KnowledgeOS   | `apps/knowledge/` · [`roadmap/apps/knowledge.md`](./roadmap/apps/knowledge.md) |
| HealthOS      | `apps/health/` · [`roadmap/apps/health.md`](./roadmap/apps/health.md) |
| App 专属证据  | `apps/*/docs/`（非全局计划真源）                                         |

## 根目录旧文件名

`CANONICAL.md`、`NETLIFY.md`、`SUPABASE.md` 等已迁至子目录，根目录保留 **重定向 stub** 以防旧链接失效。
