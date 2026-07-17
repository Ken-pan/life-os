# Life OS Docs

> **导航 hub** — 按「时间层 + 职责」组织。状态与优先级只看 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md)。

**最后核对：** 2026-07-17 晚 · 复利框架入库 + Now/Next 与代码事实对齐 · [`MAINTENANCE.md`](./MAINTENANCE.md)

## 当前优先级（摘要）

**模型：** CI 可信 → 信任收割 → 每日真源 → 防回归 → 跨 OS 快赢 — [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §推荐执行顺序 · [`roadmap/COMPOUND.md`](./roadmap/COMPOUND.md)

| 焦点 | 主题 | 文档 |
| ---- | ---- | ---- |
| Now | **PLAT.CI.0** · **FINC.PURCHASE.6.a** · **KNOW.VAULT.0** · **HOME.RECOG.1r** | [`roadmap/AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md) |
| Next | **PLAT.USAGE.0** · AIOS.STABLE.26 · HOME.MCP.13 · PLNR · object_ref | [`roadmap/USAGE_AUDIT.md`](./roadmap/USAGE_AUDIT.md) · [`roadmap/apps/`](./roadmap/apps/README.md) |
| User gate | PLNR.SCHED.10b.ios · PLNR.CAPTURE.0 · HLT-5 | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) |

**2026-07-17 已收割：** Home RECOG.0 真源闭环 · 安静扫描/matcher/证据 UI · Knowledge 块编辑器 checkpoint · Health companion 入仓 · 九品牌 Catalog — [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

> **CI（PLAT.CI.0）：** 生成物/样式基线已入仓；远程仍可能因 design-catalog a11y（portal 对比度）等红。以 GitHub Actions 全绿为准。

> **协作模型：** 单分支 — [`AGENTS.md`](../AGENTS.md) · 分线 [`roadmap/AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md)

**九 app 分卷：** [`roadmap/apps/`](./roadmap/apps/README.md) · **复利：** [`roadmap/COMPOUND.md`](./roadmap/COMPOUND.md) · **ROI：** [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md) · **愿景：** [`architecture/NORTH_STAR.md`](./architecture/NORTH_STAR.md)

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
| 判断什么值得做（复利）             | [`roadmap/COMPOUND.md`](./roadmap/COMPOUND.md) · [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md) |
| 看用量 / 功能是否真被用            | [`roadmap/USAGE_AUDIT.md`](./roadmap/USAGE_AUDIT.md)                                               |
| 看北极星愿景                       | [`architecture/NORTH_STAR.md`](./architecture/NORTH_STAR.md)                                   |
| 看体系架构快照                     | [`architecture/SYSTEM_OVERVIEW.md`](./architecture/SYSTEM_OVERVIEW.md)                         |
| 看单 app 排期                      | [`roadmap/apps/`](./roadmap/apps/README.md)                                                    |
| 看 ROI 研判证据                    | [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)                                               |
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
