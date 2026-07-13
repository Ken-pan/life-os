# Life OS Docs

> **导航 hub** — 按「时间层 + 职责」组织。状态与优先级只看 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md)。

**最后核对：** 2026-07-11 晚（执行快照：3 active lane · 10a Complete · migrate/UI closure 待合入）· 维护约定见 [`MAINTENANCE.md`](./MAINTENANCE.md)

## 当前优先级（摘要）

**模型：** Core 闭环 → 防回归 → Growth（Portal `core_*` + 单 App 管道）→ 窄 Design — 详见 [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §推荐执行顺序

| 焦点 | 主题                                                                                    | 文档                                                             |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Now  | **PLNR.SCHED.0** · **GYMS.SUB.5** UI closure · **FINC.PURCHASE.6** · **PAPR.UI**        | [`roadmap/AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md) |
| Next | PAPR.WRITE.5/6 · FINC.SYNC.1b · PLNR.CORE.4 · HOME.PROJ.7 · PLNR.UIUX.0 · PLNR.ATTACH.0 | [`roadmap/apps/`](./roadmap/apps/README.md)                      |

**2026-07-09 已验收：** Phase 6 **PORT.GROWTH.4b-H / HOME.PROJ.6a** · Portal UI 走查 **P-1–P-12** — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)
**2026-07-09 已验收：** Phase 0–4 批次 — FINC.CORE.3 · PORT.GROWTH.4b-M · PORT.GROWTH.6 · PLNR.CORE.2 · GYMS.CORE.0/GYMS.EVENTS.1 · INTG.EVENTS.1b — 见 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

> **策略（2026-07-11 晚）：** 活跃 **3** lane（Ken · Fable · Codex T1）· Antigravity **10a Complete** · Codex T2 **Complete** · Cursor/Codex T3 Queued — 执行快照 [`roadmap/AGENT_WORKSTREAMS.md`](./roadmap/AGENT_WORKSTREAMS.md) 文首表 · Prompt §7

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
├── qa/                  ← e2e · pwa · PaperOS gates · PLNR.SCHED.0 baseline
│   ├── paperos/         ← PaperOS QA 主题导航（UI + lifecycle）
│   └── paperos-device-lifecycle/  ← `PAPR.SYS.*` 生命周期导航 hub
├── PRO_MOVE.md          ← PaperOS / reMarkable gate 文档索引（36+ gate 文件）
├── tooling/             ← cursor-page-bridge
├── assets/              ← life-os-logos
├── ui-qa-screenshots/   ← QA 脚本输出（证据，非计划真源）
└── archive/             ← 历史规划
```

## 快速入口

| 我要…                                 | 打开                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 看当前在做什么                        | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §Now · §推荐执行顺序                                |
| 看六 app 状态                         | [`LIFEOS_ROADMAP.md`](./LIFEOS_ROADMAP.md) §六 app 一览                                        |
| 看单 app 排期                         | [`roadmap/apps/`](./roadmap/apps/README.md)                                                    |
| 看 ROI 研判                           | [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)                                               |
| Ticket ID 语法与 Legacy 对照          | [`roadmap/TICKET_NAMING.md`](./roadmap/TICKET_NAMING.md)                                       |
| 部署 / env / 六站 URL                 | [`ops/netlify.md`](./ops/netlify.md)                                                           |
| Growth 排期与外部对标                 | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                                                     |
| 跑远程 SQL / migration                | [`ops/supabase.md`](./ops/supabase.md)                                                         |
| 确认 canonical repo                   | [`ops/canonical.md`](./ops/canonical.md)                                                       |
| 查 contracts 白名单                   | [`architecture/contracts.md`](./architecture/contracts.md)                                     |
| 查响应式 / 页眉契约                   | [`architecture/responsive-chrome.md`](./architecture/responsive-chrome.md)                     |
| 查 life_events 格式                   | [`architecture/events-rfc.md`](./architecture/events-rfc.md)                                   |
| 调试 iOS PWA                          | [`qa/pwa-ios.md`](./qa/pwa-ios.md)                                                             |
| Planner 日程 baseline（PLNR.SCHED.0） | [`qa/planner-schedule-antigravity-baseline.md`](./qa/planner-schedule-antigravity-baseline.md) |
| PaperOS 设备生命周期（`PAPR.SYS.*`）  | [`qa/paperos-device-lifecycle/README.md`](./qa/paperos-device-lifecycle/README.md)             |
| PaperOS QA 总导航                     | [`qa/paperos/README.md`](./qa/paperos/README.md)                                               |
| PaperOS 下一步 UI                     | [`qa/paperos-next-ui-update-guide.md`](./qa/paperos-next-ui-update-guide.md)                   |
| PaperOS gate 索引                     | [`PRO_MOVE.md`](./PRO_MOVE.md)                                                                 |
| 看 E2E 失败记录                       | [`qa/e2e-issues.md`](./qa/e2e-issues.md)                                                       |
| Portal UI 截图走查（P-1–P-12 ✅）     | [`qa/portal-screenshot-audit.md`](./qa/portal-screenshot-audit.md)                             |

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
