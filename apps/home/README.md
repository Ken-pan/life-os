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
| **墙图** | 设置页一次性转换 | ① 墙体：建/删/选/拖顶点/分割/门窗 · ②③ 划分/布置（H-W3/W4） |

墙图模式下 **门窗** 挂在墙边（`graphOpenings[]`，英寸 `offsetIn`/`spanIn`），移墙跟墙走、删墙级联删开口。

## 数据模型（schema v3）

```text
SpatialProject
├── layoutMode: 'parametric508' | 'wallGraph'
├── layoutConfig?          # 508 参数（安全气囊）
├── wallGraph?             # 顶点/边 SSOT
├── graphOpenings[]        # 挂边门窗
├── zones[]                # H-W3 手绘分区
├── placements[]           # H-W4 家具
└── rooms/walls/openings…  # hydrate 派生，勿手编
```

持久化 key 不变（`homeos_spatial_v1`）；undo 栈 key `homeos_wall_graph_undo_v1`（编辑源快照 JSON）。

## 验收命令

```bash
npm run test:viewport      # 508 模式定位回归（67 checks）
npm run test:plan-edit       # 墙图 smoke：建删墙/门窗/undo/持久（6 checks）
```

截图验收报告：[`docs/qa/home-spatial-editor-audit-2026-07-08.md`](../../docs/qa/home-spatial-editor-audit-2026-07-08.md)

## 路线图

- 执行方案：[`docs/roadmap/apps/home-spatial-editor.md`](../../docs/roadmap/apps/home-spatial-editor.md)
- App 排期：[`docs/roadmap/apps/home.md`](../../docs/roadmap/apps/home.md)

**当前进度（2026-07-08）：** H-W0 ✅ · H-W1 ✅ · H-W2 核心 ✅（§5.3 交互待补）· H-W3–W5 📋
