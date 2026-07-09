# Home Roadmap

**URL：** [home.kenos.space](https://home.kenos.space) · **Workspace：** `home-os` · **层级：** 实验

## 一句话

户型 spatial 浏览/编辑 + 储藏清单；SSO ✅；**唯一无云业务数据**的 Life OS app（`homeos_spatial_v1` localStorage）。

## 当前能力（生产 / 本地）

| 域           | 状态 | 要点                                       |
| ------------ | ---- | ------------------------------------------ |
| `/plan`      | ✅   | 508 浏览/编辑 · 墙图三步壳 · H-P5 `test:viewport` |
| `/plan` 墙图 | ✅   | H-W0–W5 ✅ · Wave A/B/C UX · `test:plan-edit`（**13 checks**） |
| `/storage`   | ✅   | 储藏区卡片 · `?zone=` 深链                 |
| SSO / Portal | ✅   | H-P1–H-P3 · H-P6 储藏卡                    |
| 文档         | ✅   | [`apps/home/README.md`](../../apps/home/README.md) |
| 云同步       | ❌   | H-P4 搁置                                  |

## 空间编辑 Workstream（H-W，主线）

三步编辑器：**① 墙体（graph）→ ② 划分（手绘分区）→ ③ 布置（家具 + 储藏指派）**。墙图为 SSOT，门窗挂墙边（`graphOpenings`）。  
执行方案 → **[home-spatial-editor.md](./home-spatial-editor.md)**  
功能验收 → **[home-spatial-editor-audit-2026-07-08.md](../../qa/home-spatial-editor-audit-2026-07-08.md)**  
UI/UX 验收 → **[home-spatial-uiux-audit-2026-07-08.md](../../qa/home-spatial-uiux-audit-2026-07-08.md)**

| ID        | 主题                                | 状态 | 依赖        |
| --------- | ----------------------------------- | ---- | ----------- |
| **H-W0**  | 地基：恢复墙图 hydrate + 三步壳     | ✅   | —           |
| **H-W1**  | ① 墙体：建/删/选/拖点/分割 + 撤销   | ✅   | H-W0        |
| **H-W2**  | ①b 门窗：挂边开口 + 508 转换        | ✅   | H-W1        |
| **H-W2b** | 手机编辑壳 + hint 去重                | ✅   | H-W2        |
| **H-W2c** | §5.3 沿墙拖/改宽/门↔窗 + smoke 8    | ✅   | H-W2        |
| **Wave UX** | UX-01–22 主项 + A11Y-01/03        | ✅   | H-W2c       |
| **H-W3**  | ② 划分：手绘多边形分区              | ✅   | H-W1        |
| **H-W4**  | ③ 布置：家具 + 储藏指派（S1–S8）    | ✅   | H-W3        |
| **H-W5**  | 迁移 / smoke 全量 / 文档 / 生产走查 | ✅   | H-W4        |

**H-W 已交付（2026-07-08）：** schema v3 · 三步编辑器 · `zones[]`/`placements[]` · 储藏指派 · smoke **13 checks**。

过渡保障：`/storage?zone=…` 深链不断；设置页「返回 508」安全气囊；墙图浏览标注「508 参数快照」。

## Next（按 ROI）

| ID        | 主题                                            | ROI | 桶      | 投入   | 验收                                        |
| --------- | ----------------------------------------------- | --- | ------- | ------ | ------------------------------------------- |
| **H-W3**  | 手绘分区 `zones[]` · 画区/选区/删区             | ✅ | Product | —      | 浏览态 zones 填充 · stale 标记 · smoke 扩展 |
| **H-P7**  | 多项目 localStorage 切换                        | ◆   | Product | 1–2d   | **建议 H-W5 后**                            |
| **H-P9**  | 平面编辑首次引导                                | ○   | Product | 0.5–1d | `PlanShortcutsHelp`  onboarding             |
| **H-P10** | `/plan` smoke 扩面（508 转换 9 门窗 TST-01）    | ○   | Infra   | 0.5d   | `test:plan-edit` 或独立脚本                 |

### 实现锚点

| ID    | 文件 / 位置                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| H-W*  | [home-spatial-editor.md](./home-spatial-editor.md) · [graph-openings.js](../../apps/home/src/lib/spatial/graph-openings.js) |
| QA    | [home-spatial-editor-audit](../../qa/home-spatial-editor-audit-2026-07-08.md) · [uiux-audit](../../qa/home-spatial-uiux-audit-2026-07-08.md) |
| H-P6a | `homePortalMetadata.js` · `packages/sync/src/homePortalMetadata.js`                                                       |

## 验收命令

```bash
cd apps/home
npm run dev -- --port 5197
npm run test:viewport        # 508 模式定位（67 checks）
npm run test:plan-edit       # 墙图 smoke（8 checks）
npm run build
node scripts/qa-ui-screenshots.mjs   # UI/UX 截图（可选）
```

## Parked / Not doing

| ID        | 说明                                                |
| --------- | --------------------------------------------------- |
| **H-P4**  | 全量 Supabase spatial 同步                          |
| **H-P11** | life_events 储藏盘点                                |

## 集成

```text
Portal 实验卡 (H-P1) ──► home.kenos.space
localStorage ──► 平面/储藏真源（暂）
```
