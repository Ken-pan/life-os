# Home 空间编辑执行方案（H-W0 – H-W5）

> **Workstream：** `H-W*`（Home · Wall/空间编辑），与 `H-P*`（Home 产品杂项）并行、编号互不冲突。
> **产品形态：** `/plan` = 浏览 + 编辑（① 墙体 → ② 划分 → ③ 布置）三步编辑器。
> **SSOT 原则：** 墙图（点/边 graph）是第一步的唯一真源；门窗挂在墙边上；分区是用户手绘多边形；储藏由用户指派。**不再用 508 房间参数间接改墙。**
> **状态：** ✅ 已发货 · H-W0–W5 ✅ · Wave A/B/C UX ✅ · 创建于 2026-07-08 · 索引见 [home.md](./home.md)  
> **功能验收：** [`docs/qa/home-spatial-editor-audit-2026-07-08.md`](../../qa/home-spatial-editor-audit-2026-07-08.md) · 截图 `apps/home/screenshots/qa-hw2/`  
> **UI/UX 验收：** [`docs/qa/home-spatial-uiux-audit-2026-07-08.md`](../../qa/home-spatial-uiux-audit-2026-07-08.md)

---

## 0.1 进度快照（2026-07-08）

| 阶段 | 状态 | 要点 |
|------|------|------|
| **H-W0** | ✅ | wallGraph hydrate、三步壳、设置页转换/返回 508 |
| **H-W1** | ✅ | 建/删/选/拖顶点/分割、undo、test:plan-edit |
| **H-W2** | ✅ | `graphOpenings` · 508→9 开口 · 放置/删墙级联 · §5.3 沿墙拖/改宽/门↔窗 |
| **H-W2b** | ✅ | 手机 compact chrome · hint 去重 · GraphSelectionBar 移动可见 |
| **H-W2c** | ✅ | `PlanGraphOpeningSelectionBar` · smoke **8 checks** |
| **Wave A/B/C** | ✅ | UI/UX 审核 UX-01–22 主项 + A11Y-01/03 — 见 [uiux-audit](../../qa/home-spatial-uiux-audit-2026-07-08.md) |
| **H-W3–W5** | ✅ | 分区 · 家具/储藏 · 文档/CI |

**下一步：** H-P7 多项目 / H-P9 引导 / 云同步 H-P4

---

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| D1 | 阶段编号 | **`H-W0`–`H-W5`**（不用 H-P6.x/H-P7/H-P8/H-P9） | [home.md](./home.md) 已占用 H-P6/6a、H-P7、H-P9、H-P10（Portal 卡 / 多项目 / 引导 / smoke），语义完全不同 |
| D2 | Step 2 划分实现 | **方案 A：手绘多边形**（不做墙闭合环自动检测） | 代码库无环检测实现；A 只是多边形工具+独立图层，户型不规整也稳。环检测（Blueprint3D 的 smallest-cycle 算法）留作后续增强 |
| D3 | 编辑入口 | **已有墙图 → 直接进 ① 墙体；仅 508 → 显示一键「转换为墙图」** | 与 `isWallGraphMode()` 现有状态判断天然对齐 |
| D4 | 门窗空窗期 | **H-W0 起 carry 508 派生门窗静态渲染，H-W2 替换为挂边模型** | `buildFromWallGraph(graph, carry)` 已支持 `carry.openings`，`render-svg.js` 按 `op.pathD` 绝对坐标绘制，零新代码即可避免门窗消失 |
| D5 | 撤销/重做 | **统一「编辑源快照」栈**：快照 = `{ wallGraph, graphOpenings, zones, placements }` | 复用现有 `graphUndoStack` 机制（`state.svelte.js`），只改快照内容；三步共享一个 ⌘Z 栈，心智最简 |
| D6 | 持久化 | **沿用 `homeos_spatial_v1` key，`SPATIAL_SCHEMA_VERSION` 2→3，`load()` 内做 in-place 迁移** | 换 key（草案里的 `homeos_spatial_v3`）会留双份数据且需同步 undo key；in-place 迁移一处搞定 |
| D7 | 不做 | 整库换 Blueprint3D/OpenPlans · CSG 3D 开洞 · 恢复 508 参数拖墙为主编辑 · 恢复 `spatial-studio` 门控 | `spatial-studio.js` / `?studio=1` 已于 `39bc2707` 删除，**不要恢复**；墙图编辑做成正式功能而非工坊彩蛋 |

业界参照（详见 §11）：墙 = 平面图 graph 的边（Blueprint3D「Floorplan = Walls + Corners + Rooms」）；门窗吸附宿主墙、沿墙滑动定位（Floorplanner / RoomSketcher 的 anchor 交互）；顺序 外墙 → 内墙 → 门窗 → 家具。

---

## 1. 代码资产盘点（动工前必读）

### 1.1 现存代码（`apps/home/src/`）

| 文件 | 现状（2026-07-08） | 在 H-W 中的角色 |
|------|------|-----------------|
| [lib/spatial/wall-graph.js](../../../apps/home/src/lib/spatial/wall-graph.js) | ✅ 含 `moveVertex`/`splitWallAtMidpoint`；`buildFromWallGraph` 走 `graph-openings` 派生 | H-W1/W2 核心 |
| [lib/spatial/graph-openings.js](../../../apps/home/src/lib/spatial/graph-openings.js) | ✅ `convert508Openings` · 沿墙 move/resize · `describeGraphOpeningDrag` HUD | H-W2/c |
| [lib/spatial/model.js](../../../apps/home/src/lib/spatial/model.js) | ✅ wallGraph hydrate 分支 | H-W0 |
| [lib/state.svelte.js](../../../apps/home/src/lib/state.svelte.js) | ✅ 编辑源快照 undo · `removeGraphWall` undo toast · `setPlanImmersiveEdit` | H-W0–Wave C |
| [lib/plan-graph-edit.js](../../../apps/home/src/lib/plan-graph-edit.js) | ✅ select/wallAdd/remove/opening · 开口 pointer 拖曳 | H-W1/W2c |
| [lib/components/FloorPlanViewer.svelte](../../../apps/home/src/lib/components/FloorPlanViewer.svelte) | ✅ graph HUD · zoom chip · 编辑态左下工具条 | H-W2/Wave B |
| [lib/spatial/render-svg.js](../../../apps/home/src/lib/spatial/render-svg.js) | ✅ graph 命中层 · 删墙级联高亮 `--graph-accent` | H-W1/Wave C |
| [lib/components/PlanGraphSelectionBar.svelte](../../../apps/home/src/lib/components/PlanGraphSelectionBar.svelte) | ✅ 含分割 · 手机 compact 底栏 | H-W1/W2b |
| [lib/components/PlanGraphOpeningSelectionBar.svelte](../../../apps/home/src/lib/components/PlanGraphOpeningSelectionBar.svelte) | ✅ 改窗/改门 · 翻转 · 人类可读标题 | H-W2c |
| [lib/components/PlanSelectionBar.svelte](../../../apps/home/src/lib/components/PlanSelectionBar.svelte) | ✅ 508 选中条 · 手机 compact（Wave C UX-13） | Wave C |
| [routes/plan/+page.svelte](../../../apps/home/src/routes/plan/+page.svelte) | ✅ 三步壳 · immersive 编辑 · 转换横幅 CTA | H-W0–Wave C |
| [routes/settings/+page.svelte](../../../apps/home/src/routes/settings/+page.svelte) | ✅ 转换/返回/重新识别 · 墙图统计 | H-W0/W2 |
| [scripts/plan-edit-smoke.mjs](../../../apps/home/scripts/plan-edit-smoke.mjs) | ✅ **8 checks**（含 drag/toggle/级联/持久） | H-W2c |
| [scripts/plan-viewport-stress.mjs](../../../apps/home/scripts/plan-viewport-stress.mjs) | ✅ 508 回归 67 checks | 每阶段 |

### 1.2 git 历史资产（可直接恢复，别重写）

```bash
# 完整墙图编辑版 plan 页（1311 行，含 planMode='graph'、建墙链、测距、快捷键）
git show 39bc2707~1:apps/home/src/routes/plan/+page.svelte

# 带 wallGraph 分支的 hydrateProject（H-W0 直接参照）
git show a29d3616:apps/home/src/lib/spatial/model.js

# 历史提交
# a29d3616 feat(home): immersive plan canvas with wall graph and studio tools  ← 墙图诞生
# 39bc2707 feat(home): integrate Life OS SSO, PWA, and simplified plan UX      ← 墙图被禁用
```

旧版被 `?studio=1` 门控（`spatial-studio.js`，已删）。恢复时**剥掉所有 `studio` 条件**，墙图编辑做成正式功能。

---

## 2. 数据模型 v3

### 2.1 目标结构（`SpatialProject`，[types.js](../../../apps/home/src/lib/spatial/types.js)）

```
SpatialProject (schemaVersion: 3)
├── layoutMode: 'parametric508' | 'wallGraph'
├── wallGraph            { pxPerFt, margin, vertices[], edges[] }      ← Step① SSOT（已有）
├── graphOpenings[]      { id, edgeId, offsetIn, spanIn,               ← Step①b（H-W2 新增）
│                          type: 'door'|'window',
│                          style?: 'swing'|'sliding'|'bifold',
│                          swing?: 'in'|'out', hidden? }
├── zones[]              { id, nameZh, color?, polygon: Point[],       ← Step②（H-W3 新增）
│                          stale? }
├── placements[]         { id, kind, label, x, y, w, h,                ← Step③（H-W4 新增）
│                          rotation: 0|90|180|270, zoneId? }
├── storageZones[]       现有字段 + { zoneId?, placementId? }          ← Step③ 指派（H-W4）
└── （rooms / walls / openings / furniture 仍是 hydrate 派生的渲染层，不手编）
```

要点：

- **派生层不变**：`render-svg.js` 消费的 `walls[]` / `openings[]`（含 `pathD`）继续由 `hydrateProject` 派生。H-W2 的关键就是让 `buildFromWallGraph` 从 `graphOpenings` 派生出「带缺口的墙线 + 门窗符号」，渲染层几乎不改。
- **`graphOpenings` 用英寸偏移**（`offsetIn` 沿边起点、`spanIn` 宽度），换算 `px = in * pxPerFt / 12`。墙移动/缩放时开口自动跟随；`deleteWallEdge` 时级联删除 `edgeId` 匹配的开口。
- **`zones[].polygon` 独立图层**，不参与墙派生。墙图变更后给相交 zone 打 `stale: true`（只标记不重算）。
- **储藏新语义**：`storageZones[i].bounds` 在指派了 `zoneId`/`placementId` 后由对应几何派生（zone → 多边形 bbox；placement → 矩形本身）；未指派的保留原 508 固定 bbox 兜底，`/storage?zone=S3` 深链全程不断。

### 2.2 撤销/重做（D5）

`state.svelte.js` 现有 `pushGraphUndo` 只快照 `raw.wallGraph`。H-W2 起改为快照**编辑源包**：

```js
function snapshotEditSource(raw) {
  return JSON.stringify({
    wallGraph: raw.wallGraph,
    graphOpenings: raw.graphOpenings ?? [],
    zones: raw.zones ?? [],
    placements: raw.placements ?? [],
  })
}
```

undo/redo 反序列化后整包 `applyWallGraph` 风格提交。栈上限沿用 `MAX_LAYOUT_UNDO = 24`，key 沿用 `homeos_wall_graph_undo_v1`（内容格式变了，H-W2 落地时清空一次旧栈即可）。

### 2.3 持久化与迁移（D6）

- key 不变：`homeos_spatial_v1`。
- `SPATIAL_SCHEMA_VERSION`：2 → 3（H-W2 落地时 bump）。
- `load()` 内迁移：`schemaVersion < 3` 且存在 wallGraph 项目 → 补空 `graphOpenings/zones/placements` 数组；508 项目零迁移。
- 导出 payload：`exportLayoutJson` 的 `homeos-layout-v2` schema 扩字段即可（向后兼容：`importLayoutJson` 对缺失数组按空处理）。

---

## 3. H-W0 — 地基：墙图能存、能显示、有壳 ✅

**状态：** 已发货（2026-07-08）

**目标**：切到墙图 → 刷新 → 墙线 + 静态门窗 + 储藏区仍在；编辑页出现 ①②③ 三步壳。
**前置**：无。

### 步骤

**3.1 恢复 `hydrateProject` 的 wallGraph 分支** — [model.js](../../../apps/home/src/lib/spatial/model.js)

以 `git show a29d3616:apps/home/src/lib/spatial/model.js` 为参照，恢复为：

```js
export function hydrateProject(project) {
  if (project.layoutMode === 'wallGraph' && project.wallGraph) {
    return buildFromWallGraph(project.wallGraph, project)   // project 整体作 carry
  }
  if (!project.layoutConfig) {
    return { ...build508Project(default508Config(), project), layoutMode: 'parametric508' }
  }
  const config = merge508Config(default508Config(), project.layoutConfig)
  return { ...build508Project(config, project), layoutMode: 'parametric508' }
}
```

注意两处与旧版的差异：
- **不要**恢复旧版对 furniture 的处理歧义——508 分支保持现状（清空 furniture），wallGraph 分支靠 carry 透传（`buildFromWallGraph` 里 `furniture: []` 暂不变，H-W4 再放开）。
- `buildFromWallGraph` 的 carry 已透传 `rooms`/`openings`/`storageZones`（[wall-graph.js:240-245](../../../apps/home/src/lib/spatial/wall-graph.js)）→ **D4 的门窗静态渲染免费获得**：`activateWallGraphMode` 先 hydrate 508 再转 graph，此时 project 身上带着 508 派生的 `openings[]`（含 `pathD` 绝对坐标）和 `rooms[]`，切换后原样显示。

**3.2 `load()` 停止降级墙图** — [state.svelte.js:255-258](../../../apps/home/src/lib/state.svelte.js)

删掉这四行（`if (stored.layoutMode === 'wallGraph') { ... delete stored.wallGraph }`），并把 259 行 hydrate 调用里的硬编码 `layoutMode: 'parametric508'` 改为 `layoutMode: stored.layoutMode ?? 'parametric508'`。

**3.3 编辑页三步壳** — [plan/+page.svelte](../../../apps/home/src/routes/plan/+page.svelte)

保持现有 `浏览 | 编辑` 外层分段，编辑态内部加第二层分段：

```
[ 浏览 | 编辑 ]
        [ ① 墙体 | ② 划分 | ③ 布置 ]        ← editStep: 'walls' | 'zones' | 'place'
```

- `let editStep = $state('walls')`；②③ 先 `disabled`（title「H-W3 / H-W4 开放」）。
- 508 模式下进入编辑：显示现有 508 拖墙编辑 + 顶部横幅「此户型为参数模式，[转换为墙图] 后可自由建删墙」→ 点击调 `activateWallGraphMode()`（已存在）。
- 墙图模式下进入编辑：直接落在 ① 墙体（D3）。
- 保留 `revertToParametric508()` 的「返回 508」入口（放设置页，见 3.4），作为整个 H-W 期间的安全气囊。

**3.4 设置页入口卡片** — [settings/+page.svelte](../../../apps/home/src/routes/settings/+page.svelte)

新增「户型编辑模式」卡片：当前模式徽标（`isWallGraphMode()`）· 按钮「从当前户型生成墙图（一次性）」→ `activateWallGraphMode()` · 墙图模式下显示「返回 508 参数模式」→ `revertToParametric508()`（confirm 提示墙图改动不会回写 508）。

**3.5 图例适配** — [PlanLegend.svelte](../../../apps/home/src/lib/components/PlanLegend.svelte)：墙图模式下隐藏 508 专属条目（如「拖墙调整」提示），门窗图例保留。

### 验收

```bash
cd apps/home && npm run dev          # http://127.0.0.1:5197
npm run test:viewport                # 508 模式回归必须全 PASS（prime() 自会切回 508）
```

手工：设置页转换墙图 → `/plan` 墙线/门窗/储藏斜线均显示 → 刷新仍在 → 点储藏区跳 `/storage?zone=…` 正常 → 返回 508 恢复原状。
**已知可接受**：房间填充为切换瞬间 508 快照（H-W3 用 zones 替换）。

建议 commit：`feat(home): H-W0 restore wallGraph hydration + 3-step edit shell`

---

## 4. H-W1 — ① 墙体编辑：建 / 删 / 选 / 拖点 / 分割 ✅

**状态：** 已发货（2026-07-08）

**目标**：能删「储物柜东墙」这类真实墙段、画新隔墙、拖端点调墙、撤销重做全通。
**前置**：H-W0。

### 步骤

**4.1 恢复墙图工具接线（半天，大部分是搬运）**

从 `git show 39bc2707~1:apps/home/src/routes/plan/+page.svelte` 搬回以下逻辑（剥掉所有 `studio` 条件；旧版 `planMode === 'graph'` 概念改为 `editMode && editStep === 'walls' && isWallGraphMode()`）：

- `graphTool` state（`'select' | 'wallAdd' | 'remove'`）+ 工具分段按钮（旧版 457–470 行有现成 markup）。
- 建墙链：`wallChainFrom` / `wallChainHover` state + `onGraphWallPoint`（点第一下定起点、第二下 `addGraphWall()` 提交并链到下一段，Esc 断链——旧版 193–205、340 行）。
- `FloorPlanViewer` 传参：`graphEditMode` `graphTool` `wallChainFrom` `wallChainHover` `onGraphWallPoint` `onGraphRemoveEdge={removeGraphWall}` `onGraphSelectEdge` `onGraphHover`（组件侧 435–459 行已支持，零改动）。
- 选中墙段 → `PlanGraphSelectionBar`（撤销/重做/删除墙段，现成组件）。
- 快捷键：⌘Z/⌘⇧Z 在墙图模式路由到 `undoGraphEdit`/`redoGraphEdit`（旧版 111、385 行）；`Delete` 删选中边；`1/2/3` 切工具（新增，可选）。

**4.2 端点拖拽（新功能，约 1d）**

- [wall-graph.js](../../../apps/home/src/lib/spatial/wall-graph.js) 新增：

```js
/** 拖动顶点到新位置；吸附 1″ 网格；若落点与其他顶点重合(3px)则合并并去重边 */
export function moveVertex(graph, vertexId, x, y) { /* clone → snap → merge → dedupe edges */ }
```

  合并规则参照 `findOrCreateVertex` 容差；合并后如产生重复边（同 a/b），保留一条。
- [render-svg.js](../../../apps/home/src/lib/spatial/render-svg.js) `graphEditMode` 分支：`select` 工具下为每个顶点画把手 `<circle data-vertex-id r=6>`（触摸放大 `touchScale`）。
- [plan-graph-edit.js](../../../apps/home/src/lib/plan-graph-edit.js)：`select` 工具增加 pointerdown 命中 `[data-vertex-id]` → pointermove 预览（回调 `onVertexDrag(vertexId, pt)`，页面层把预览 graph 塞给 viewer 的临时 prop 或直接节流提交）→ pointerup `onVertexDrop` 走 `moveVertex` + `applyWallGraph`。**提交在 up 时一次**，move 期间只画预览线，避免撤销栈爆炸。
- 拖动中 HUD 显示两端相邻边长度（`Math.hypot/pxPerFt` → `ft'in"`，复用 [dimensions.js](../../../apps/home/src/lib/spatial/dimensions.js) 格式化）。

**4.3 Shift 正交 + 分割接线（半天）**

- 建墙链 pointermove 时按住 Shift：把 hover 点投影到与起点水平/垂直的轴上（`|dx|>|dy| ? y=y0 : x=x0`），落点提交同理。实现放 plan 页 `onGraphHover` 包装层即可，不动库。
- 分割：`select` 工具选中边后，选中条加「分割」按钮 → `splitWallAt(graph, edgeId, midX, midY)`（[wall-graph.js:116](../../../apps/home/src/lib/spatial/wall-graph.js) 已实现）→ `applyWallGraph`。中点坐标 = 两端点均值；后续可升级为点击位置分割。

**4.4 smoke 测试** — 新建 `apps/home/scripts/plan-edit-smoke.mjs`（Playwright，仿 `plan-viewport-stress.mjs` 骨架）：

1. prime：localStorage 写入一个 wallGraph 项目（直接构造 vertices/edges JSON）。
2. 进编辑 → ① 墙体 → 画一段墙（两次 click）→ 断言 `data-edge-id` 数 +1。
3. 删一段墙 → 断言 -1 且孤立顶点被清。
4. ⌘Z ×2 → 断言回到初始边数；刷新 → 边数持久。
5. package.json 加 `"test:plan-edit": "node scripts/plan-edit-smoke.mjs"`。

### 本步不做

门窗编辑（静态贴图继续挂着）· 房间命名 · S1–S8 语义 · 家具。

### 验收

```bash
npm run test:viewport      # 508 回归
npm run test:plan-edit     # 新 smoke
```

手工：删掉储物柜东墙对应边 → 画一道新隔墙（Shift 正交）→ 拖端点微调 → 撤销全链 → 刷新持久。

建议 commit：`feat(home): H-W1 wall tools — draw/delete/vertex-drag/split with undo`

---

## 5. H-W2 — ①b 门窗：挂边开口 ✅

**状态：** H-W0–W2c + Wave A/B/C UX 已发货（2026-07-08）· **H-W3** 手绘分区下一步

**目标**：门窗成为墙边的寄生数据——移墙跟墙走、删墙级联删；替换 H-W0 的静态贴图。
**前置**：H-W1。

### 步骤

**5.1 模型与派生（约 1d，本阶段核心）**

- [types.js](../../../apps/home/src/lib/spatial/types.js)：加 `GraphOpening` typedef（§2.1）；`SpatialProject` 加 `graphOpenings?: GraphOpening[]`；`SPATIAL_SCHEMA_VERSION` → 3。
- [wall-graph.js](../../../apps/home/src/lib/spatial/wall-graph.js) `buildFromWallGraph` 扩展：

```js
// 对每条边：收集其 graphOpenings，按 offsetIn 排序，把边切成 [墙段, 缺口, 墙段…]
// → walls[] 输出多段 kind:'wall'（缺口处不输出线或输出 kind:'gap'）
// → openings[] 输出 SpatialOpening：门画四分之一圆摆臂 pathD（swing 方向），窗画三线符号
//   pathD 由 edge 向量 + offsetIn/spanIn 换算，模板参照 layout-508.js 现有门窗生成
```

  派生后 `render-svg.js` 的 228–237 行（按 `pathD` 绘制）**零改动**即可渲染。
- 级联：`deleteWallEdge` 增加第三参或在 state 层包装——删边时同步过滤 `graphOpenings.filter(o => o.edgeId !== edgeId)`；`splitWallAt`/`moveVertex` 时按比例重算受影响开口的 `offsetIn`（分割：开口落在哪半段就归哪条新边）。

**5.2 一次性迁移：508 门窗 → 挂边开口（半天）**

- `export508ToWallGraph` 同层新增 `convert508Openings(project, graph)`：对 508 派生 `openings[]` 的每个 `hitRect`/`from-to`，用 `pickWallEdgeAt` 找最近边、投影得 `offsetIn/spanIn`，产出 `graphOpenings[]`。
- `activateWallGraphMode()` 调用它；转换后**移除** carry 的静态 `openings`（D4 过渡完成）。已在墙图模式的老数据：设置页给「重新识别门窗」按钮跑同一函数。

**5.3 工具（约 1d）**

编辑 ① 内加第四工具「门窗」（或独立 `graphTool: 'opening'`）：

- **放置**：点墙边 → 在点击处按默认宽（门 32″/窗 48″）插入 → 立即选中。
- **选中/滑动**：点开口符号 → 沿宿主边拖动改 `offsetIn`（投影到边向量，clamp 0…edgeLen-span）。
- **改宽**：选中后两端把手拖拽改 `spanIn`（参照 508 编辑的 `RESIZE_GRIP_*` 常量风格）。
- **删除**：`Delete` 直接从 `graphOpenings` 移除（真删，不是 508 的 `disabledOpenings` 软隐藏）。
- **类型切换**：选中条上 门↔窗、开向 in/out。

**5.4 撤销栈升级为编辑源快照**（§2.2，半小时）+ `load()` 迁移补空数组（§2.3）。

**5.5 smoke 扩展** ✅：`test:plan-edit` **8 checks**（放门 · 沿墙拖 · 改门/窗 · 删墙级联 · undo ×2 · 持久）。待补：508 全量转换后 door/window 坐标断言（TST-01）。

**5.6 截图验收（2026-07-08）** — 功能见 [`home-spatial-editor-audit`](../../qa/home-spatial-editor-audit-2026-07-08.md) · UI/UX 见 [`home-spatial-uiux-audit`](../../qa/home-spatial-uiux-audit-2026-07-08.md)

| 优先级 | 问题 | 方案摘要 |
|--------|------|----------|
| P0 | ~~手机编辑画布过小（UI-01）~~ | ✅ H-W2b：compact header + 68dvh 画布 |
| P1 | ~~hint 三重重复（UI-03）~~ | ✅ AppBar 短副标题 + viewer hint + ? 抽屉 |
| P1 | ~~移动端无 GraphSelectionBar（UI-02）~~ | ✅ H-W2b 底部 compact bar |
| P1 | ~~竖墙 bifold 符号错误（UI-06）~~ | ✅ `bifoldVertical*` / `slidingVertical` |

### H-W2b — 手机 UX + hint 去重（2026-07-08）✅

- `plan/+page.svelte`：移除页头 hint 行；`edit-chrome-row` 横向滚动；`toolbarMinimal` 传 viewer
- `FloorPlanViewer.svelte`：`toolbarMinimal` 精简 zoom 条；graph hint SSOT
- `PlanGraphSelectionBar.svelte`：≤599px 底部可见 compact 条
- `PlanShortcutsHelp.svelte`：`contextHint` 显示当前工具长文案
- `doors.js` + `graph-openings.js`：竖墙门窗符号
- `settings/+page.svelte`：墙图统计（FN-02）

**下一步 H-W2c：** ~~§5.3 沿墙滑动 / 改宽 / 门↔窗切换（FN-01）~~ ✅ 2026-07-08

### Wave UX（2026-07-08）✅

| 波次 | 范围 | 文档 |
|------|------|------|
| Wave A | 手机 P0：工具两行 · 门窗不弹 drawer · silent drag · 深色画布 | [uiux-audit §Wave A](../../qa/home-spatial-uiux-audit-2026-07-08.md) |
| Wave B | P1：`--graph-accent` · 转换 CTA · zoom chip · graph HUD · 图例 | 同上 §Wave B |
| Wave C | P2：508 移动 bar · 删墙 undo toast · immersive 编辑 · FAB「详情」 | 同上 §Wave C |

**下一步 H-W3：** 手绘分区 `zones[]`

### 验收

移墙后门窗跟墙走；删墙开口级联删；508 转换进来的 6 门 2 窗位置与原图目视一致；`test:viewport` + `test:plan-edit` PASS。

建议 commit：`feat(home): H-W2 edge-hosted openings with 508 conversion`

---

## 6. H-W3 — ② 划分：手绘分区（3–4d）

**目标**：在墙围合内画多边形分区、命名、上色；浏览模式显示区名。**不是** 508 房间表。
**前置**：H-W1（不依赖 H-W2，可并行）。

### 步骤

**6.1 模型**：`zones[]`（§2.1）。`id` 用 `zone-{seq}`；`color` 从预设色板取（沿用 508 房间 fill 色系，见 [layout-508.js](../../../apps/home/src/lib/spatial/layout-508.js) 的 fill 值）。

**6.2 画区工具**（约 1.5d）：编辑 ② 分段激活，工具 `[画区] [选区] [删区]`：

- **画区**：逐点点击落顶点（复用 `snapGraphPoint` 吸附），预览线实时跟随；点击首点 8px 内或按 Enter 闭合（≥3 点）；Esc 取消。交互与 ① 建墙链同构，可抽公共 hook。
- **选区**：点填充选中 → 拖顶点微调（复用 4.2 的把手模式）→ 侧栏/选中条改名、换色、删除。
- **删区**：删 zone 不动墙。
- 命中检测：point-in-polygon（射线法，~15 行，放新文件 `lib/spatial/zones.js`）。

**6.3 渲染**：`render-svg.js` 新图层（墙之下、储藏斜线之上）：淡色填充（`fill-opacity: .18`）+ 质心区名标签。质心用顶点均值即可（凹多边形标签偏一点可接受，后续再换 polylabel）。浏览模式仅显示填充+名字，不可点（储藏区点击优先）。

**6.4 stale 标记**：`applyWallGraph` 提交时，若有 zone 的 polygon 与任一改动边相交 → `stale: true`，渲染加虚线边框 + 图例「需核对」；用户在选区状态点「确认」清除。**不自动重算**（D2 的复杂度红线）。

**6.5 hydrate 衔接**：wallGraph 分支的 `rooms` 派生改为：`zones[]` 存在 → 由 zones 生成 `SpatialRoom`（bbox 作 bounds，polygon 另存渲染）；否则继续 carry 旧 508 rooms 快照。`toExtrusionHints()` 的 `floors` 同步吃 zones polygon（3D 铺垫，顺手 5 行）。

**6.6 smoke 扩展**：画 3 点区 → 命名 → 刷新持久 → 删一面相交墙 → 断言 stale 虚线出现。

### 验收

划 6 个区并命名（客厅/厨房/卧室/卫生间/衣帽/阳台）→ 浏览显示区名 → 导出 JSON 含 `zones[]` → 改墙后相交区标「需核对」。

建议 commit：`feat(home): H-W3 hand-drawn zone partitions`

---

## 7. H-W4 — ③ 布置 + 储藏指派（3–5d）

**目标**：矩形家具符号可放置/旋转/删除；S1–S8 从固定坐标改为指派到 zone 或家具位；`/storage` 全程不断。
**前置**：H-W3。

### 步骤

**7.1 家具 placements**（约 1.5d）：

- 模型 `placements[]`（§2.1）。符号库先做 8 类：床、沙发、桌、椅、柜、架、洗衣机、冰箱——全部矩形 + label（Cedreo 式简化，不做异形）。
- 工具：编辑 ③ 分段 `[家具] [标储藏]`。放置 = 选类型 → 点画布落默认尺寸 → 拖动移动（复用 508 拖拽的 pointer 管线 [plan-edit-drag.js](../../../apps/home/src/lib/plan-edit-drag.js) 思路）→ 选中条：旋转 90°、改尺寸（ft'in" 输入，复用 [RoomDimensionsEditor](../../../apps/home/src/lib/components/RoomDimensionsEditor.svelte) 的输入组件）、删除。
- `zoneId` 自动归属：落点做 point-in-polygon 命中 zones。
- 渲染：灰块 + label（508 furniture 的样式已有，`hideFurniture` prop 反转控制）；浏览模式默认隐藏、图例开关显示。

**7.2 储藏指派**（约 1d）：

- `SpatialStorageZone` 加 `zoneId?/placementId?`；hydrate 时：有指派 → `bounds` 由目标几何派生（placement 矩形 / zone bbox），`marker` 取质心；无指派 → 保留原 bbox（**深链兜底，全程不断**）。
- 交互：③ 内「标储藏」工具 → 点 zone 或家具 → 弹选 S1–S8（或新建 S9+）→ 写入指派；选中储藏区可解绑。
- `/storage` 页零改动（继续读 `storageZones`）；平面点击跳转逻辑不变。

**7.3 hydrate 放开 furniture**：wallGraph 分支由 `placements` 派生 `furniture[]`（`SpatialFurniture` 结构），508 分支维持现状。

**7.4 导出**：[export-html.js](../../../apps/home/src/lib/spatial/export-html.js) 的 MHTML 快照确认包含 zones 填充 + 家具 + 储藏斜线（它吃 render-svg 输出，理论上免费，走查一遍）。

**7.5 smoke 扩展**：放柜子 → 标为 S1 → 断言平面斜线区移动到柜子位置 → 点击跳 `/storage?zone=S1` 清单仍在。

### 验收

某柜位标为 S1 → 平面可点 → 储藏页清单完整；家具浏览可隐藏；导出含区+家具+储藏。

建议 commit：`feat(home): H-W4 furniture placements + storage assignment`

---

## 8. H-W5 — 迁移、测试、文档、上线（1–2d）

- **迁移**：`load()` 的 v2→v3 补全（§2.3）走查三种存量：纯 508 / 墙图无开口 / 手工导入 JSON。原 S 区未指派的显示「待指派」徽标提示（不强制）。
- **测试**：`test:viewport`（508 回归）+ `test:plan-edit`（墙/门窗/分区/储藏四段 smoke）进 CI 习惯命令；[home.md](./home.md) 验收命令区更新。
- **文档**：更新 [home.md](./home.md) H-W 状态 → `LIFEOS_ROADMAP.md` §Shipped；`apps/home/README.md`（顺手完成 H-P0）写清三步编辑器操作与数据模型。
- **清理**：确认无 `studio` 残留引用；508 参数拖墙保留为「508 模式」的编辑方式（不删，仅不再是主路径）；`WALL_EDIT_BINDINGS` 等 508 编辑代码原地保留。
- **生产走查**：build → deploy → 真机（手机竖屏）过一遍三步编辑 + 储藏跳转。

建议 commit：`chore(home): H-W5 migration, smoke suite, docs`

---

## 9. 测试策略汇总

| 命令 | 覆盖 | 阶段 |
|------|------|------|
| `npm run test:viewport` | 508 模式定位回归（现有，动态 N checks；prime 自带切回 508） | 每阶段回归 |
| `npm run test:plan-edit`（新） | wallGraph smoke：建/删/拖点/撤销/持久 → +门窗跟随 → +分区 stale → +储藏指派 | H-W1 建立，逐阶段追加 |
| 手工矩阵 | 触屏（iPhone 竖屏）· 深色模式 · 返回 508 往返 · 导出/导入 JSON 往返 | H-W0/W2/W4/W5 |

原则：**每阶段合并前两条命令必须全绿**；wallGraph 的断言只进 `plan-edit-smoke`，不往 `plan-viewport-stress.mjs` 里塞（它的 prime 逻辑与墙图互斥）。

---

## 10. 时间线

```text
Week 1   H-W0 + H-W1        地基 + 建/删/拖墙 → 已能「重画户型」
Week 2   H-W2               门窗挂边 + 508 门窗一次性转换
Week 3   H-W3               手绘分区（可与 H-W2 部分并行）
Week 4   H-W4               家具 + 储藏指派
Week 5   H-W5               迁移、smoke 全量、文档、生产走查
之后     H-P4（搁置中）      云同步 Supabase；H-P7 多项目切换建议排在 H-W 全程之后
```

依赖链：`H-W0 → H-W1 → H-W2 → H-W4`；`H-W1 → H-W3 → H-W4`；`H-W4 → H-W5`。

---

## 11. 外部参考

- 墙图 = 平面直线图，房间 = 图中最小闭合环；半边结构渲染墙两侧 — [Blueprint3D](https://github.com/furnishup/blueprint3d) · [blueprint-js（ES6 版）](https://github.com/aalavandhaann/blueprint-js) · [Half-Edge 解析](https://deepwiki.com/dvisionlab/blueprint3d/3.1.4-half-edge)（方案 B 未来若做自动分区，从这里抄算法）
- 门窗 anchor 吸附宿主墙、沿墙滑动、把手改宽 — [RoomSketcher 入门指南](https://help.roomsketcher.com/hc/en-us/articles/208845045-Getting-Started-Guide-Draw-Your-First-Floor-Plan) · [Floorplanner 编辑器手册](https://cdn.floorplanner.com/static/brochures/FloorplannerManualEN.pdf)
- 端点拖拽合并、墙交点自动清理、吸附距离设置 — [Home Designer snap settings](https://www.homedesignersoftware.com/support/article/KB-00377/controlling-snap-settings.html) · [Floor Plan Creator FAQ](https://floorplancreator.net/help/faq)
- 逐点落顶点画表面/分区、拖顶点重塑 — [Coohom 手绘表面](https://www.coohom.com/article/floor-planner-how-to-draw-surface-manually)
