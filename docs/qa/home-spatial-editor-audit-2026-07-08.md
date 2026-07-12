# Home 空间编辑 · 截图验收报告

> **日期：** 2026-07-08 · **范围：** HOME.SPATIAL.0 / HOME.SPATIAL.1 / HOME.SPATIAL.2（本地 `http://127.0.0.1:5197`）
> **截图目录：** [`apps/home/screenshots/qa-hw2/`](../../apps/home/screenshots/qa-hw2/)
> **执行方案：** [`../roadmap/apps/home-spatial-editor.md`](../roadmap/apps/home-spatial-editor.md)

## 验收方法

| 步骤 | 说明 |
|------|------|
| 环境 | `cd apps/home && npm run dev -- --port 5197` |
| 截图 | Playwright 脚本批量采集（桌面 1280×900、iPhone SE 375×667、深色模式） |
| 自动化 | `npm run check` · `npm run test:viewport`（67 PASS）· `npm run test:plan-edit`（**8 PASS**） |
| 508→墙图 | 设置页「从当前户型生成墙图」→ 识别 **9** 个 `graphOpenings`（6 门 + 2 窗 + 1 推拉门，不含 AC） |

## 截图索引

| 文件 | 场景 |
|------|------|
| `01-plan-browse-508-desktop.png` | 508 浏览 |
| `02-plan-edit-508-desktop.png` | 508 编辑 + 「转换为墙图」横幅 |
| `03-plan-edit-wallgraph-desktop.png` | 墙图编辑 · 工具栏（选择/建墙/门窗/删墙） |
| `04-settings-wallgraph-desktop.png` | 设置 · 户型编辑模式 |
| `05-plan-edit-wallgraph-iphone-se.png` | 墙图编辑 · 手机竖屏（**画布面积不足**） |
| `06-plan-edit-wallgraph-dark-iphone-se.png` | 同上 · 深色 |
| `07-plan-browse-wallgraph-desktop.png` | 墙图浏览（若仍为 508 则 localStorage 被测试 prime 重置） |

---

## 问题清单（按优先级）

### P0 — 阻塞手机编辑体验

| ID | 现象 | 截图 | 根因 | 建议方案 | 参考 |
|----|------|------|------|----------|------|
| **UI-01** | iPhone SE 竖屏编辑时，画布仅剩窄条；工具栏占屏 >50% | `05`, `06` | `plan-top` 四层堆叠（模式 + 三步 + 四工具 + hint）+ `FloorPlanViewer` 浮动 zoom 条 | **≤599px**：① 三步与四工具合并为一行可横向滚动；② hint 移入 `?` 抽屉；③ viewer 内 hint 在 graph 模式隐藏；④ 采用 **partially persistent header**（下滚隐藏、上滚露出） | [NN/g Sticky Headers](https://www.nngroup.com/articles/sticky-headers/) · [Floor Plan Studio mobile toolbar collapse](https://github.com/alexanderblackh/floor-plan-studio/issues/4) |
| **UI-02** | `PlanGraphSelectionBar` 在 `max-width:599px` 设为 `display:none` | 代码 | 移动端无法触达分割/删墙/撤销快捷条 | 改为底部 **compact toolbar**（与 508 的 `PlanSelectionBar` 对齐），或强制走 drawer「墙图」面板 | 同 UI-01：44px 最小触达 |

### P1 — 桌面/通用 UX

| ID | 现象 | 截图 | 根因 | 建议方案 |
|----|------|------|------|----------|
| **UI-03** | 操作提示重复 2–3 次（页头 `plan-hint-line` + `setPlanSubtitle` + viewer `.plan-hint-*`） | `01`, `03` | 双通道 subtitle：`+page.svelte` 与 `FloorPlanViewer` 各渲染 hint | **单一 SSOT**：graph/508 模式仅 viewer 工具条显示上下文 hint；页头只保留模式/步骤 |
| **UI-04** | 508 编辑页头过高（模式 + 三步 + 横幅 + hint ≈ 137px） | `02` | 编辑控件全展 | 桌面：三步与 undo 同行；横幅可 dismiss；hint 单行 ellipsis |
| **UI-05** | 浮动 zoom 条遮挡平面右上角（客厅/卧室交界） | `01`, `03` | `FloorPlanViewer` toolbar 绝对定位 | 小屏移入 header overflow；或 collapsible chip（仅显示 zoom %） |
| **UI-06** | 竖向墙上门窗符号：`bifold`/`swing` 仍走水平模板 | 墙图转换后目视 | `graph-openings.js` `graphOpeningToSpatial` 对非水平边复用 `bifoldHorizontalUp` | 按边方向分支：水平用现有 `doors.js`；垂直用 `swingVertical*`；bimodal 不足时用 `M…L…` 折线兜底 |

### P2 — 功能/信息架构

| ID | 现象 | 根因 | 建议方案 | 对应阶段 |
|----|------|------|----------|----------|
| **FN-01** | HOME.SPATIAL.2 §5.3 未完成：沿墙滑动、改宽把手、门↔窗切换 | 本轮仅实现放置+删除+508 转换 | 按 RoomSketcher anchor 模型补 `offsetIn` 拖拽与把手 | **HOME.SPATIAL.2b** |
| **FN-02** | ~~设置页未展示统计~~ | ✅ HOME.SPATIAL.5：顶点/墙段/门窗/分区/家具 | — | ✅ |
| **FN-03** | ~~508 房间快照~~ | ✅ HOME.SPATIAL.3：`zones[]` 替换填充 + 无 zones 时角标 | — | ✅ |
| **FN-04** | `exportLayoutJson` 已含 `graphOpenings`；旧导入无该字段 | 向后兼容 OK | 文档注明 v2 payload 新字段 | 文档 ✅ 本轮 |

### P3 — 文档/测试债

| ID | 现象 | 建议 |
|----|------|------|
| **DOC-01** | `home-spatial-editor.md` §1 资产表仍描述 HOME.SPATIAL.0 前状态 | 已在本轮文档更新中修正 |
| **DOC-02** | 无 `apps/home/README.md` | 已创建（HOME.EXPER.0） |
| **TST-01** | 508 转换 9 门窗 | 可选 HOME.SMOKE.10；当前 smoke 13 checks 覆盖墙/门窗/分区/储藏 |

---

## 已通过项 ✅

- 508 浏览/编辑、储藏区 S1–S8、viewport 压力测试（67 checks）
- 墙图：建墙/删墙/撤销/持久化、门窗放置、删墙级联清除 `graphOpenings`（6 checks）
- 设置：转换墙图 / 返回 508 / 重新识别门窗
- Schema v3 + 编辑源快照 undo（`wallGraph` + `graphOpenings` + `zones` + `placements`）
- 深色模式基础可读（无严重对比度失败）

---

## 推荐修复顺序（供下一轮开发）

```text
1. ~~UI-03  hint 去重~~ ✅ 2026-07-08 HOME.SPATIAL.2b
2. ~~UI-01 + UI-02  手机编辑壳折叠~~ ✅ 2026-07-08 HOME.SPATIAL.2b（hint→? 抽屉；工具条横向滚动；GraphSelectionBar 移动端可见）
3. ~~UI-06  门窗符号方向~~ ✅ 2026-07-08 HOME.SPATIAL.2b（竖墙 bifold/sliding）
4. ~~FN-01  门窗沿墙拖动~~ ✅ 2026-07-08 HOME.SPATIAL.2c
5. HOME.SPATIAL.3   手绘分区
```

## UI/UX Wave 验收（2026-07-08）

功能项（UI/FN）见上文 HOME.SPATIAL.2b/c。**高标准 UI/UX** 另见专卷：

- [`home-spatial-uiux-audit-2026-07-08.md`](./home-spatial-uiux-audit-2026-07-08.md) — Wave A/B/C ✅；剩余 A11Y-02 · I18N-01 · polish 见该文档 §剩余开放

## HOME.SPATIAL.2c 已修复（2026-07-08）

| ID | 修复 |
|----|------|
| FN-01 | 选择工具：拖门窗沿墙改 `offsetIn`；端点握把改 `spanIn`；底部条「改窗/改门」「翻转」「删除」 |
| — | `plan-graph-edit.js` 开口 pointer 管线；`graph-openings.js` move/resize/preview/HUD |
| — | `PlanGraphOpeningSelectionBar.svelte`；smoke +2（drag / toggle）→ **8 checks** |

**参考：** [RoomSketcher 门窗拖曳沿墙](https://help.roomsketcher.com/hc/en-us/articles/360000808925) · 蓝箭头改宽

## HOME.SPATIAL.2b 已修复（2026-07-08）

| ID | 修复 |
|----|------|
| UI-03 | 移除页头 `plan-hint-line`；AppBar 短副标题 + 画布工具条完整 hint；`?` 抽屉显示 `contextHint` |
| UI-01 | 手机编辑：primary 行 + 横向滚动 `edit-chrome-row`；44px 触达；画布 `min-height: 68dvh` |
| UI-02 | `PlanGraphSelectionBar` 移动端底部 compact 条（撤销/删/分割） |
| UI-05 | `toolbarMinimal`：手机编辑隐藏 fit 按钮与浮动 hint，zoom 条移右下角 |
| UI-06 | `doors.js` 新增 `bifoldVertical*` / `slidingVertical`；`graph-openings.js` 按边方向分支 |
| FN-02 | 设置页墙图统计（顶点/墙段/门窗数） |

**网络参考：** [NN/g Sticky Headers](https://www.nngroup.com/articles/sticky-headers/) · [Floor Plan Studio #4 mobile toolbar](https://github.com/alexanderblackh/floor-plan-studio/issues/4) · [lens-pdf fixed toolbar on mobile](https://github.com/printwithsynergy/lens-pdf/commit/2d0240c)

## 复现命令

```bash
cd apps/home
npm run dev -- --port 5197
# 重新生成截图（仓库内脚本，非 CI）：
node -e "..." # 见 git 历史中 qa-hw2 批量截图 one-off
npm run test:viewport
npm run test:plan-edit
```
