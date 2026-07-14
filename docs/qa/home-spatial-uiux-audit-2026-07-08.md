# Home 空间编辑 · 高标准 UI/UX 审核报告

> **日期：** 2026-07-08（HOME.SPATIAL.2c 后 · **Wave A/B/C UX** 2026-07-08 收尾）
> **审核框架：** Nielsen 10 启发式 · WCAG 2.2 触达/对比 · CAD 编辑器惯例（RoomSketcher / Figma / Floor Plan Studio）
> **截图：** `docs/ui-qa-screenshots/home/uiux-audit/2026-07-08/`（初版，gitignored；已被后续 Wave B/C 重跑覆盖，跑 `qa-ui-screenshots.mjs` 重建）
> **前置修复：** UI-01–06、FN-01 已在 HOME.SPATIAL.2b/c 处理；**Wave A–C** 见下文「已修复」节

## 审核方法

| 维度 | 做法                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面 | 1280×900 · 508 浏览/编辑 · 墙图选择 · 门窗选中 · 帮助面板                                                                                                |
| 移动 | iPhone SE 375×667 · 浅色/深色 · 墙图编辑 · 门窗选中                                                                                                      |
| 代码 | 组件层级、z-index、copy、键盘/触达、设计 token                                                                                                           |
| 参考 | [RoomSketcher 门窗交互](https://help.roomsketcher.com/hc/en-us/articles/360000808925) · [NN/g 移动表单](https://www.nngroup.com/articles/mobile-inputs/) |

## 截图索引

| 文件                                   | 场景      | 主要发现                                   |
| -------------------------------------- | --------- | ------------------------------------------ |
| `01-browse-508-desktop.png`            | 508 浏览  | zoom 条占右上；图例/FAB 三角分布           |
| `02-edit-508-desktop.png`              | 508 编辑  | 转换横幅 + 双行工具；508 移动端 bar 仍隐藏 |
| `04-edit-wallgraph-select-desktop.png` | 墙图·选择 | 绿/蓝双色系；hint 与 AppBar 副标题重复     |
| `05-opening-selected-desktop.png`      | 门窗选中  | **内部 ID 外露**；toast 与底栏叠层         |
| `06-help-panel-desktop.png`            | 帮助      | **Delete 文案与墙图语义冲突**              |
| `08-edit-wallgraph-iphone-se.png`      | 手机编辑  | **四工具被裁切**；画布仍偏矮               |
| `09-opening-selected-iphone-se.png`    | 手机·门窗 | **抽屉自动弹 + toast 遮挡**                |
| `10-edit-wallgraph-dark-iphone-se.png` | 深色手机  | **画布近空白/对比失败**                    |

---

## 问题总览（按优先级）

### P0 — 阻塞或严重误导（应先修）

| ID        | 启发式        | 现象                                                                              | 截图 | 根因                                                                                 | 建议                                                                                                |
| --------- | ------------- | --------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **UX-01** | 可见性 / 美学 | 深色模式 + 手机竖屏：画布大面积白/空，几乎看不到墙线与网格                        | `10` | `plan-viewer` 背景与 SVG 纸色/房间填充未随 theme 协调；小屏 fit 后内容缩在可视区外   | 深色 `--plan-paper` + 房间 fill 降饱和；移动编辑默认 `fit contain` 并加 **「未加载到墙图」空态**    |
| **UX-02** | 一致性 / 效率 | iPhone SE：`建墙/门窗/删墙` 在首屏外被裁切，仅见「选择」一字                      | `08` | `edit-chrome-row` 可滚动但**无滚动暗示**（无 fade/chevron）；步骤+四工具总宽 > 375px | ① 工具与步骤分两行折叠 ② 或首屏只显示图标+label ③ `scroll-snap` + 右缘 gradient                     |
| **UX-03** | 用户控制      | 选中门窗后手机**自动打开 drawer**，与底部 `PlanGraphOpeningSelectionBar` 职责重复 | `09` | `openDrawerForSelection()` 在 `onGraphSelectOpening` 无条件触发                      | 墙图门窗：**仅走 bottom bar**；drawer 留给墙段详情/508 inspector                                    |
| **UX-04** | 错误预防      | Toast「已调整门窗」落在 drawer 内容区之上，遮挡「顶点 4 · 墙段…」                 | `09` | Toast z-index 与 drawer 同级；每次 drag end 都 toast                                 | 拖曳过程用 **HUD/ghost 尺寸**；commit 时 toast 或 **silent + haptic**；toast 应 `top` 或低于 drawer |

### P1 — 显著损害专业感或可学性

| ID        | 启发式         | 现象                                                           | 截图       | 根因                                               | 建议                                                                 |
| --------- | -------------- | -------------------------------------------------------------- | ---------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| **UX-05** | 系统与现实匹配 | 选中条标题显示 **`门 · go-audit-1`** 等内部 ID                 | `05`, `09` | `PlanGraphOpeningSelectionBar` 直接用 `opening.id` | 显示 **「门 · 32″」/「窗 · 48″」** 或「客厅北墙」；ID 仅 dev tooltip |
| **UX-06** | 一致性         | 帮助面板写 Delete =「**隐藏**选中门窗」，墙图模式实为**真删**  | `06`       | `PlanShortcutsHelp` 仅 508 文案                    | 按 `graphEditMode` 分支：墙图 →「删除门窗」；508 →「隐藏」           |
| **UX-07** | 帮助与文档     | 帮助未覆盖墙图：**1/2/3 工具切换、分割、沿墙拖、端点改宽**     | `06`       | HOME.SPATIAL.1–W2c 未同步 help                               | 扩展快捷键表 + 链接到 `?` 内 contextHint                             |
| **UX-08** | 系统与现实     | 禁用步显示 **`title="HOME.SPATIAL.3 开放"`** — 开发里程碑泄露给用户      | 代码       | 产品 copy 未替换                                   | 「即将推出：手绘分区」+ 可选 waitlist/说明链接                       |
| **UX-09** | 视觉设计       | **双 accent 体系**：墙图绿 `#1d6b42` vs 全局 `--accent` 蓝灰   | `04`, `05` | graph 组件 hardcode 绿色                           | 统一为 theme token（如 `--graph-accent`）或文档化「编辑态=绿」       |
| **UX-10** | 效率           | 508 编辑「转换为墙图」是关键迁移路径，却做成**正文内文本链接** | `02`       | `.plan-convert-link` 样式弱                        | 主按钮 + 次要说明；可 dismiss 的 inline banner                       |
| **UX-11** | 可见性         | 桌面 zoom 条仍挡 **右上户型**（阳台/客餐厅交界）               | `01`, `05` | `position:absolute; top-right`                     | 移入 header 工具 overflow 或 **仅图标 chip** 展开                    |
| **UX-12** | 反馈           | 墙图拖门窗/改宽**无实时尺寸 HUD**（508 有 drag HUD）           | 代码       | graph drag 未接 HUD                                | 复用 `dragHint` 显示 `offsetIn`/`spanIn` 英尺英寸                    |

### P2 — 体验债 / HOME.SPATIAL.3 前可排期

| ID        | 启发式   | 现象                                                                         | 建议                                                     |
| --------- | -------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| **UX-13** | 一致性   | 508 的 `PlanSelectionBar` 在 ≤599px 仍为 `display:none`                      | 与墙图 bar 对齐，或统一「选中 → bottom sheet」           |
| **UX-14** | 识别性   | 图例未解释：绿顶点、门窗虚线框、端点改宽圆点                                 | `PlanLegend` 墙图模式增加 3 项                           |
| **UX-15** | 诚实 IA  | 墙图浏览仍显示 **508 房间名/色块**（非真实 zones）                           | HOME.SPATIAL.3 前浏览态角标「508 快照」                            |
| **UX-16** | 识别性   | FAB「墙图/调整/房间」对新用户含义模糊                                        | 改「详情」图标 + 副标签；或选中时才出现                  |
| **UX-17** | 错误预防 | 「删墙」工具一次点击即删，无 confirm                                         | 首次 soft-delete 或 toast 撤销；删前高亮级联门窗         |
| **UX-18** | 效率     | Undo/Redo 仅在有历史时出现，编辑态常**无入口**                               | 编辑模式固定显示 ↶↷（disabled 态）                       |
| **UX-19** | 触达     | 图例按钮 `min-height:32px` < 44px                                            | 移动 ≥44px 或扩大 hit slop                               |
| **UX-20** | 细节     | 竖墙改宽 grip 光标仍为 `ew-resize`                                           | 按边方向 `ns-resize` / 旋转 handle                       |
| **UX-21** | 密度     | 手机竖屏：**AppBar + plan-top + bottom nav + FAB + bar** 垂直 chrome 仍 >45% | 编辑态 **immersive**：隐藏 AppBar 副标题/收缩 bottom nav |
| **UX-22** | 反馈     | 每次 drag commit 都 toast「已调整门窗」— 高频打扰                            | silent commit + 可选 undo toast                          |

### P3 — 无障碍 / 国际化

| ID          | 现象                                    | 建议                                |
| ----------- | --------------------------------------- | ----------------------------------- |
| **A11Y-01** | 帮助 dialog 打开时焦点管理不完整        | `autofocus` 关闭按钮 + `aria-modal` |
| **A11Y-02** | 墙段/门窗选中仅靠颜色（绿框）           | 加 `aria-selected` / 虚线动画       |
| **A11Y-03** | 快捷键列表仅 ⌘，未提 Ctrl（Windows）    | 平台检测或并列标注                  |
| **I18N-01** | 中英混排「阳台 Balcony/Patio」+ 中文 UI | 统一 locale 策略                    |

---

## 已通过 / 回归确认 ✅

- Hint 三重重复（旧 UI-03）已缓解：AppBar 短副标题 + viewer hint + `?` 抽屉
- 手机 GraphSelectionBar / GraphOpeningSelectionBar / **PlanSelectionBar（508）** 可见
- 手机 zoom 精简；编辑态折叠 % chip + 左下定位（UX-11）
- 门窗沿墙拖、改宽、门↔窗 + **graph drag HUD**（FN-01 · UX-12）
- 竖墙 symbol / grip 光标（UI-06 · UX-20）
- `--graph-accent` token 统一墙图编辑色（UX-09）
- 删墙 act-then-undo toast + 级联橙色高亮（UX-17）
- 手机编辑 immersive（副标题 + bottom nav 收起 · UX-21）
- 帮助 `aria-modal` + 平台快捷键（A11Y-01/03）

## 开放项状态（2026-07-08 收尾）

| ID                        | 说明           | 状态                                  |
| ------------------------- | -------------- | ------------------------------------- |
| UX-01† / UX-13† / A11Y-02 | Wave 3 polish  | ✅                                    |
| **I18N-01**               | 房间名中英混排 | ✅ 默认仅中文（`showRoomEnglish` 关） |

---

## 推荐修复波次

```text
Wave A（P0，1–2d）— 手机可用性
  UX-02 工具条裁切 + 滚动暗示
  UX-03 取消门窗选中自动 drawer
  UX-04 toast 与 drawer 层级
  UX-01 深色移动画布对比

Wave B（P1，1–2d）— 专业 CAD 感
  UX-05 人类可读选中标题
  UX-06/07 帮助 copy 与墙图快捷键
  UX-12 拖曳尺寸 HUD
  UX-09 accent token 统一

Wave C（P2，随 HOME.SPATIAL.3/W5）
  UX-13/14/15 508 移动 bar + 图例 + 浏览快照标注
  UX-17/18  destructive confirm + 常驻 undo
```

## Wave A 已修复（2026-07-08）

| ID            | 修复                                                                 |
| ------------- | -------------------------------------------------------------------- |
| UX-02         | 手机：步骤与四工具**分两行**；工具行可横滚 + 右缘 gradient           |
| UX-03         | 选中门窗不再自动打开 drawer                                          |
| UX-04 / UX-22 | 拖曳 commit **silent**（无 toast 遮挡 drawer）                       |
| UX-01         | 移动 graph 编辑自动 `fit contain`；画布 `72dvh`；深色 stage 衬托纸面 |
| UX-05         | 选中条「门 · 2′8″」替代内部 ID                                       |
| UX-06 / UX-07 | 帮助面板墙图/508 分支 + 墙图快捷键说明                               |
| UX-08         | 禁用步骤 tooltip 产品化                                              |

**下一步：** Wave B（UX-09/10/11/12）· **HOME.SPATIAL.3** 手绘分区

## Wave B 已修复（2026-07-08）

| ID    | 修复                                                                                     |
| ----- | ---------------------------------------------------------------------------------------- |
| UX-09 | `--graph-accent` / `--graph-accent-muted` token；墙图组件/SVG 统一引用                   |
| UX-10 | 508 编辑「转换为墙图」**主按钮横幅** +「稍后」dismiss（sessionStorage）                  |
| UX-11 | 桌面编辑态 zoom 条**移左下** + 默认**折叠为 % chip**（Fusion 式 progressive disclosure） |
| UX-12 | 墙图门窗拖曳 **HUD**（`describeGraphOpeningDrag` · 沿墙 offset / 宽度 ft-in）            |
| UX-14 | `PlanLegend` 墙图模式 +3 项（顶点、门窗虚线框、改宽握把）                                |
| UX-15 | 墙图浏览角标「508 参数快照」                                                             |
| UX-18 | 编辑态 **常驻 ↶↷**（disabled 态可见）                                                    |
| UX-19 | 图例按钮移动 ≥44px                                                                       |
| UX-20 | 竖墙改宽 grip `ns-resize`（`data-wall-axis`）                                            |

**参考：** [Autodesk Fusion toolbar progressive disclosure](https://www.swetzoff.com/projects/project-autodesk-di.html) · [OpenCad2D cursor-adjacent HUD](https://github.com/archistico/OpenCad2D) · [Syncfusion floor planner dimensions](https://github.com/syncfusion/ej2-showcase-react-floor-planner)

**下一步：** Wave C（UX-13/17/21）· **HOME.SPATIAL.3** 手绘分区

## Wave C 已修复（2026-07-08）

| ID      | 修复                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| UX-13   | `PlanSelectionBar` 手机端 compact 底栏（与墙图 bar 对齐，横滚 + 44px）        |
| UX-17   | 删墙 **act-then-undo** toast（8s「撤销」）；删墙工具下含门窗墙段 **橙色高亮** |
| UX-21   | 手机编辑 **immersive**：隐藏 AppBar 副标题 + 收起 bottom nav，画布 `78dvh`    |
| UX-16   | FAB 统一为「详情」；选中 bar 可见时自动隐藏                                   |
| A11Y-01 | 帮助 dialog `aria-modal` + 打开时 focus 关闭按钮                              |
| A11Y-03 | 快捷键 ⌘ / Ctrl+ 平台分支                                                     |

**参考：** [Undo UX Pattern](https://uxpatternsguide.com/patterns/undo/) · [Vauchi GUI — confirm only irrevocable](https://docs.vauchi.app/developers/gui-guidelines.html) · [magicplan undo placement](https://help.magicplan.app/undo)

**下一步：** **HOME.SPATIAL.3** 手绘分区 · UX-13 508 inspector 深链 · A11Y-02 选中动画

## Wave 3 已修复（2026-07-08）

| ID         | 修复                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| UX-03 延伸 | 移动端选中墙段 / 508 **不再自动弹 drawer**；手动点底栏「详情」仍可打开       |
| UX-01†     | 墙图为空时在 `plan-stage` 顶部显示 **「墙图为空 · ① 建墙…」** 提示条         |
| UX-13†     | `PlanSelectionBar` compact 底栏增加 **「尺寸」** 展开，内联宽/深英尺英寸输入 |
| A11Y-02    | SVG 选中元素加 `aria-selected`；选中虚线 **pulse 动画**（`plan-sel-pulse`）  |

**验证：** `npm run check` · `npm run test:plan-edit` · `npm run test:viewport`

## Wave 3.1 回归修复（2026-07-08）

| 问题                                                  | 修复                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 手机编辑 `plan-top` 撑至 ~375px、画布 `plan-stage` ≈0 | compact select 行去掉 `flex: 1 1 140px` 纵向拉伸；immersive 画布改 flex 填充（`min-height: 0` + stage `min(52dvh)`） |

**复验截图：** `verify/23-edit-mobile-fixed.png` · `09-opening-selected-iphone-se.png` · `25-empty-graph-mobile-fixed.png`

## Wave 3.2 已知问题收尾（2026-07-08）

| ID           | 修复                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| Select 时序  | compact `<select>` 改 `value` + 显式 handler，修复步骤切换后工具栏不更新   |
| UX-03 / 底栏 | immersive 选中条 `bottom: safe + 14px`；门窗 compact 显示「门 · 2′8″」标题 |
| I18N-01      | 平面图默认仅渲染中文房间名（英文需 `showRoomEnglish`）                     |

## 复现

```bash
cd apps/home
npm run dev -- --port 5197
node scripts/qa-ui-screenshots.mjs   # 生成本报告截图
npm run test:plan-edit               # 8 checks
npm run test:viewport                # 67 checks
```
