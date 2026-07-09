# Home OS（实验）

**URL：** [home.kenos.space](https://home.kenos.space) · **Workspace：** `home-os` · **数据：** `localStorage` key `homeos_spatial_v1`（暂无云同步）

居家空间 **平面浏览/编辑** + **储藏清单**（S1–S8）。Life OS SSO ✅；Portal 实验卡 ✅。

## 快速开始

```bash
cd apps/home
npm install          #  monorepo 根目录 npm install 亦可
npm run dev          # http://127.0.0.1:5173 默认；QA 常用 5197
npm run build
npm run check
```

## 路由

| 路径 | 用途 |
|------|------|
| `/` | 概览 |
| `/plan` | 顶视平面 · 浏览 / 编辑 |
| `/storage` | 储藏区清单 · 支持 `?zone=S3` 深链 |
| `/settings` | 账号 · 外观 · **户型编辑模式**（508 ↔ 墙图） |

## 平面编辑：两种模式

| 模式 | 说明 | 编辑方式 |
|------|------|----------|
| **508 参数** | 默认 · Avalon #508 参数化 | 拖内墙/门窗；Delete 软隐藏门窗 |
| **墙图** | 设置页一次性转换 | ① 墙体 · **② 划分**（画区/选区/删区）· **③ 布置**（8 类家具 + 储藏指派 S1–S8） |

墙图模式下 **门窗** 挂在墙边（`graphOpenings[]`，英寸 `offsetIn`/`spanIn`），移墙跟墙走、删墙级联删开口（toast 可撤销）。

### 编辑 UX 要点（2026-07-08）

- 墙图编辑色：`--graph-accent`（`app.css`）
- 手机编辑：**immersive**（收起 bottom nav + 隐藏 AppBar 副标题）
- 选中条：墙图 / 508 均在手机端 compact 底栏
- 删墙：橙色级联高亮 + 8s「撤销」toast
- 帮助：`?` · `PlanShortcutsHelp`（墙图/508 分支 · ⌘/Ctrl 自适应）

## 数据模型（schema v3）

```text
SpatialProject
├── layoutMode: 'parametric508' | 'wallGraph'
├── layoutConfig?          # 508 参数（安全气囊）
├── wallGraph?             # 顶点/边 SSOT
├── graphOpenings[]        # 挂边门窗
├── zones[]                # 手绘分区（polygon + stale）
├── placements[]           # 矩形家具（8 类）
├── storageZones[]         # S1–S8 · 可 zoneId/placementId 指派
└── rooms/walls/openings…  # hydrate 派生，勿手编
```

持久化 key 不变（`homeos_spatial_v1`）；undo 栈 key `homeos_wall_graph_undo_v1`（编辑源快照 JSON）。

## 验收命令

```bash
npm run test:viewport      # 508 模式定位回归（67 checks）
npm run test:plan-edit       # 墙图 smoke（13 checks：墙/门窗/分区/储藏）
node scripts/qa-ui-screenshots.mjs   # UI/UX 截图（可选）
```

## 文档

| 文档 | 用途 |
|------|------|
| [`docs/roadmap/apps/home-spatial-editor.md`](../../docs/roadmap/apps/home-spatial-editor.md) | H-W0–W5 执行方案 |
| [`docs/roadmap/apps/home.md`](../../docs/roadmap/apps/home.md) | App 排期 |
| [`docs/qa/home-spatial-editor-audit-2026-07-08.md`](../../docs/qa/home-spatial-editor-audit-2026-07-08.md) | 功能验收 |
| [`docs/qa/home-spatial-uiux-audit-2026-07-08.md`](../../docs/qa/home-spatial-uiux-audit-2026-07-08.md) | UI/UX 审核（Wave A/B/C） |

**当前进度（2026-07-08）：** H-W0–W5 ✅ · Wave A/B/C UX ✅ · 三步编辑器（墙体/划分/布置）已发货
