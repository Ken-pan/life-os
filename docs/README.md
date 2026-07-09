# Life OS Docs

> **导航 hub** — 按「时间层 + 职责」组织。状态与优先级只看 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md)。

**最后重组：** 2026-07-09 · 维护约定见 [`MAINTENANCE.md`](./MAINTENANCE.md)

## 当前优先级（摘要）

**模型：** Core 闭环 → 防回归 → Growth（Portal `core_*` + 单 App 管道）→ 窄 Design — 详见 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §推荐执行顺序

| 焦点    | 主题                   | 文档                                             |
| ------- | ---------------------- | ------------------------------------------------ |
| Now     | **P-MOVE-1** PaperOS on Paper Pro Move | [`roadmap/apps/planner-pro-move.md`](./roadmap/apps/planner-pro-move.md) |
| Next    | **H-W3** Home 手绘分区 | [`roadmap/apps/home.md`](./roadmap/apps/home.md) |

**2026-07-09 已验收：** Phase 6 **G-P4b-H / H-P6a** · Portal UI 走查 **P-1–P-12** — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)
| ○ 条件 | G-P4b-H / H-P6a | 每天用 Home |

**2026-07-09 已验收：** Phase 0–4 批次 — F-P3 · G-P4b-M · G-P6 · P-P2 · FT-P0/FT-P1 · I-P1.5b — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

**六 app 分卷：** [`roadmap/apps/`](./roadmap/apps/README.md) · **潜力研判：** [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)

## 六 app + 插件（一览）

| App / 插件                          | 层级                  | 文档                                                                       |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Planner · Fitness · Finance · Music | 生产四站              | [`roadmap/apps/`](./roadmap/apps/README.md)                                |
| Portal                              | 启动器                | [`roadmap/apps/portal.md`](./roadmap/apps/portal.md)                       |
| Home                                | 实验第六站            | [`roadmap/apps/home.md`](./roadmap/apps/home.md)                           |
| Finance OS Sync                     | Chrome 扩展（非 app） | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md#f-p1) · `apps/finance/extension` |

## 文档地图（单人团队四层）

| 层                 | 目录 / 文件                                                                    | 回答什么问题                     |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------- |
| **Future + Now**   | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) + [`roadmap/`](./roadmap/README.md) | 做什么、不做什么、发货记录       |
| **Present · 运维** | [`ops/`](./ops/README.md)                                                      | 怎么部署、连哪库、以谁为准       |
| **Present · 架构** | [`architecture/`](./architecture/README.md)                                    | 契约、事件、未来 Native 边界     |
| **Present · 质量** | [`qa/`](./qa/README.md)                                                        | E2E、PWA、IME、截图证据          |
| **Tooling**        | [`tooling/`](./tooling/README.md)                                              | Cursor / DevTools 集成           |
| **Past**           | [`archive/`](./archive/README.md)                                              | 已合并的旧规划（勿在新 PR 引用） |
| **Assets**         | [`assets/`](./assets/README.md)                                                | 品牌 SVG / icon manifest         |

```text
docs/
├── LIFEOS_ROADMAP.md    ← 每周扫一眼（Now / Next / Shipped / Not doing / 六 app 一览）
├── MAINTENANCE.md       ← 怎么维护这套文档
├── roadmap/             ← 分卷：INTEGRATION · GROWTH · PLATFORM · DESIGN · BACKLOG · SHIPPED · apps/
├── ops/                 ← Netlify · Supabase · canonical
├── architecture/        ← contracts · responsive-chrome · events-rfc · native-readiness
├── qa/                  ← e2e · pwa · input-ime
├── tooling/             ← cursor-page-bridge
├── assets/              ← life-os-logos
├── ui-qa-screenshots/   ← QA 脚本输出（证据，非计划真源）
└── archive/             ← 历史规划
```

## 快速入口

| 我要…                             | 打开                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- |
| 看当前在做什么                    | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §Now · §推荐执行顺序            |
| 看六 app 状态                     | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §六 app 一览                    |
| 看单 app 排期                     | [`roadmap/apps/`](./roadmap/apps/README.md)                                |
| 看 ROI 研判                       | [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)                           |
| 部署 / env / 六站 URL             | [`ops/netlify.md`](./ops/netlify.md)                                       |
| Growth 排期与外部对标             | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                                 |
| 跑远程 SQL / migration            | [`ops/supabase.md`](./ops/supabase.md)                                     |
| 确认 canonical repo               | [`ops/canonical.md`](./ops/canonical.md)                                   |
| 查 contracts 白名单               | [`architecture/contracts.md`](./architecture/contracts.md)                 |
| 查响应式 / 页眉契约               | [`architecture/responsive-chrome.md`](./architecture/responsive-chrome.md) |
| 查 life_events 格式               | [`architecture/events-rfc.md`](./architecture/events-rfc.md)               |
| 调试 iOS PWA                      | [`qa/pwa-ios.md`](./qa/pwa-ios.md)                                         |
| 看 E2E 失败记录                   | [`qa/e2e-issues.md`](./qa/e2e-issues.md)                                   |
| Portal UI 截图走查（P-1–P-12 ✅） | [`qa/portal-screenshot-audit.md`](./qa/portal-screenshot-audit.md)         |

## 验收命令（hub 级）

```bash
./scripts/verify-life-os-identity-p0.sh
./scripts/test-outbox-trigger.sh --smoke
npm run check:lifeos-boundaries
npm run test:design-catalog              # 172 smoke
npm run test:design-catalog:a11y         # catalog a11y gates
npm run test:design-catalog:snapshots    # 80 pixel baselines
```

## Packages & Apps

| 类型          | 文档位置                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| 共享包        | `packages/{contracts,sync,theme,platform-web,design-tokens}/README.md`   |
| 生产 + Portal | `apps/{planner,fitness,finance,music,portal}/README.md`                  |
| Home 实验     | `apps/home/` · [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0) |
| App 专属证据  | `apps/*/docs/`（非全局计划真源）                                         |

## 根目录旧文件名

`CANONICAL.md`、`NETLIFY.md`、`SUPABASE.md` 等已迁至子目录，根目录保留 **重定向 stub** 以防旧链接失效。
