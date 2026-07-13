# PaperOS E-ink UI 规范与执行指导

**Date:** 2026-07-10（UI）· lifecycle cross-ref 2026-07-11
**Status:** Proposed execution SSOT（UI track）
**Lifecycle（独立轨道）：** PAPR.SYS.1 architecture discovery **complete** · implementation **paused by owner** — [`paperos-device-lifecycle/README.md`](./paperos-device-lifecycle/README.md)
**Applies to:** `PAPR.UI Core Slice 1.1 Correction` + `Core Slice 2 Home/Today`
**Repo path:** [`docs/qa/paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md)
**Related gates:** [`paperos-core-slice-1-integration-gate.md`](./paperos-core-slice-1-integration-gate.md) · [`paperos-core-slice-1-visual-gate.md`](./paperos-core-slice-1-visual-gate.md)
**Long-term product brief:** [`paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md) · gap audit [`paperos-eink-uiux-gap-audit.md`](./paperos-eink-uiux-gap-audit.md)

---

## TL;DR / 决策

当前 Core Slice 1 已经完成了最难的底层闭环：临时 System Drawer、Notes Gallery、真实 notebook 打开、native ink、clean/revealed editor chrome、八张确定性截图和 xochitl recovery。下一步不要直接进入 OCR、Search、Page Overview 或模板系统。

接下来分成两个连续、可独立合并的更新：

1. **Core Slice 1.1 — Correction Pass（现在）**
   - 修复真实设备上工具切换 / 颜色切换后 toolbar 视觉状态不同步的问题。
   - 收轻 editor revealed rail。
   - 清掉 Gallery 边框、重黑 `+`、Drawer 粗 active bar 三个视觉债。
   - 重新跑物理笔迹、截图和 recovery gate。

2. **Core Slice 2 — Unified Home/Today（Slice 1.1 合并后）**
   - 合并 Home + Today 成一个日常入口。
   - 将系统 IA 收敛为 `Today · Notes · Tasks · Documents · Settings`。
   - Home 页面以 Continue writing、Recent notes、Tasks、Documents 组成，不做 dashboard 卡片墙。
   - 不实现 Search；没有真实能力时不展示假搜索入口。

**明确推迟：** multi-page data migration、Page Overview、New Note Templates、OCR/Handwriting Search、Tags、Quick Switcher、Control Center。

---

# 1. 研究依据与设计判断

## 1.1 设备事实

Paper Pro Move 的官方规格为 7.3 英寸、16:9、1696 × 954、264 PPI。竖屏坐标即 954 × 1696。官方强调 distraction-free / focused work，并把纸张体验、快速笔迹响应和少干扰作为核心产品价值。[R1][R2]

这意味着 PaperOS 的 UI 不能机械照搬现代网页或 OLED App：

- 不能靠阴影、模糊、半透明叠层制造层次；
- 不能把每块内容都装进圆角 Card；
- 不能让永久工具栏侵占纸张；
- 必须用排版、留白、少量分隔和临时 surface 建立层级；
- 所有关键动作必须有可见入口，手势只能是加速路径。

## 1.2 reMarkable 原生 IA 可借鉴之处

reMarkable 官方导航使用左上角 Menu 进入 sidebar，文件系统包含 notebooks、PDF/ebooks、favorites、tags、trash 和 settings；此外有单独 drawer 用于 recent / favorite files。搜索、grid/list view、page overview、templates、tags 和 handwriting search 都是现实存在的产品能力，而不是概念稿幻想。[R3][R4][R5]

PaperOS 可以借鉴这些**模式**，但不要复制整个原生系统：

- `System drawer` 负责稳定的一级目的地；
- `Quick switcher` 未来负责 recent/favorite 的快速切换；
- `Notes Gallery` 负责内容浏览；
- `Editor chrome` 只在需要时出现；
- `Page Overview` 必须等 multi-page canonical storage 成立后再做。

## 1.3 关于“现代感”的纠偏

Gemini 的对比中，“更多圆角、浅灰线、阴影、反白、丰富图标”对 LCD 产品通常成立，但对 E Ink 只应选择性采用：

| 可采用 | 不能机械采用 |
|---|---|
| 清晰图标系统 | 大量装饰图标 |
| 受控圆角语义 | 每个容器都圆角 |
| 四级灰阶 | 过多接近的灰色 |
| 临时 pressed 反白 | 长时间大面积纯黑选中块 |
| 增加留白 | 为“高级感”浪费主要内容区 |
| 轻量 paper object | 阴影浮层 / nested cards |

**PaperOS 的高级感来源：比例准确、信息层级稳定、控件退场、状态诚实和设备反馈干净。**

---

# 2. 当前状态与问题重新分级

## 2.1 已经完成，不要重做

- 临时 System Drawer 已替代永久 bottom tabs；
- Notes Gallery 已有双列方向；
- 可打开真实 notebook；
- native ink、笔迹和橡皮擦实际体验通过；
- editor 有 clean / revealed / after-writing 状态；
- 八张确定性 device screenshots 已通过；
- TestBridge semantic IDs 与 fail-closed capture runner 已建立；
- xochitl recovery 已通过；
- 没有引入 multi-page migration 或 fake page count。

## 2.2 已解决的 P0 merge blocker

**工具 / 颜色实际状态与 toolbar 视觉状态偶发不同步 (已修复)**

已在 commit `52ae55e0` 中由工程 Agent 完全修复：
- 选中笔或橡皮擦、切换颜色后，立即绘制并更新 framebuffer 缓存（`m_captureFrame`）；
- 任何工具/颜色操作现在都能够保证 pipeline 状态、QML 表面映射与 C++ framebuffer 的完全一致；
- 避免了 retreat/re-reveal 状态还原时覆盖旧选中态以及局部像素残留等问题。

## 2.3 Antigravity 视觉 findings 的真实优先级

| Finding | 新优先级 | 决策 |
|---|---:|---|
| Tool / color toolbar 显示异常 | **P0** | **已解决 (Commit 52ae55e0)** |
| Revealed tool rail 视觉偏重 | P1 | 与 P0 同一 native pass 收轻 |
| Notes thumbnail structural border | P1 | **已解决 (Commit d7c52858)** |
| 黑色方形 `+` 过重 | P1 | **已解决 (Commit d7c52858)** |
| Drawer active indicator 太粗 | P2 | **已解决 (Commit d7c52858)** |
| Drawer 仍保留 Inbox / Review / System | Transition debt | Slice 2 处理；不阻塞 Slice 1.1 |
| Home 与 Today 仍分开 | Transition debt | Slice 2 处理；不阻塞 Slice 1.1 |

---

# 3. PaperOS UI 系统规范 v0.2

以下参数针对 954 × 1696 竖屏。数值为第一轮实施基线，最终以真机截图和触控体验调整。

## 3.1 基础栅格

| Token | 建议值 | 用途 |
|---|---:|---|
| `space-1` | 8 px | 最小对齐单位 |
| `space-2` | 16 px | 紧凑内部间距 |
| `space-3` | 24 px | 元素间距 / grid gutter |
| `space-4` | 32 px | 屏幕左右 margin |
| `space-5` | 40 px | section 间距 |
| `space-6` | 48 px | 大区块间距 |
| Screen margin X | 32 px | 所有普通页面 |
| Screen margin top | 32–40 px | 避免内容贴边 |
| Header height | 104–112 px | 菜单、标题、主动作 |

## 3.2 触控尺寸

W3C 的增强目标建议自定义触控目标至少 44 × 44 CSS px，并特别指出粗粒度 touch 和边缘目标应更大。[R6]

PaperOS 内部采用更保守的设备像素规则：

| 元素 | 可见尺寸 | 实际 hit box |
|---|---:|---:|
| 普通 icon | 28–36 px | **88 × 88 px** |
| Toolbar item | 30–36 px | 80–88 px 高 |
| Color swatch | 24–30 px | 64–72 px |
| Tab label | 24–28 px | 88 px 高 |
| Drawer row | — | 96 px 高 |
| Checkbox / task control | 28–36 px | 72–88 px |

**原则：视觉可以轻，hit box 不能小。**

## 3.3 灰阶 Token

只允许四个主层级，避免多个接近灰色在 E Ink 上坍缩：

| Token | 建议初值 | 语义 |
|---|---|---|
| `Paper` | panel/native white；fallback `#F7F7F3` | 画布、页面、主要 surface |
| `Ink100` | `#111111` | 主标题、当前项、关键图标 |
| `Ink70` | `#555555` | 正文、inactive control、secondary label |
| `Ink30` | `#B0B0AA` | divider、disabled、metadata、轻边界 |

### 状态映射

- **Current:** Ink100 + 字重提升；不默认使用黑底。
- **Selected:** Ink100 icon + 2 px ring / 2–4 px 短 indicator。
- **Pressed:** 可短暂 Ink100 实心 + Paper icon/text。
- **Inactive:** Ink70。
- **Disabled:** Ink30，且不能响应。
- **Focus:** 1–2 px Ink100 outline；不做 glow。

## 3.4 圆角语义

| 对象 | Radius | 说明 |
|---|---:|---|
| Paper thumbnail | 2–4 px | 接近真实纸张，不做 App card |
| Button / segmented control | 10–12 px | 控件识别 |
| Modal / drawer floating sub-surface | 16–20 px | 仅临时 surface |
| Search field | 16–24 px | 未来 Search flow 专用 |
| Pill | 尽量不用 | 只用于明确的 filter/status |

**不允许：** 所有 section、列表、任务行、缩略图都使用同一个大圆角。

## 3.5 Border 与层次

- 默认无 border；
- 需要结构边界时仅用 1 px Ink30；
- Modal boundary 可用 1–2 px Ink70；
- 不使用 2 px 纯黑 structural card border；
- 不使用 drop shadow；
- 不通过灰色大底块包住整个 section；
- 优先顺序：**留白 → 字体 → 对齐 → 细 divider → border**。

## 3.6 Typography

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Date / hero | 48–54 px | Medium/Semibold | 58–64 |
| Page title | 40–44 px | Semibold | 48–52 |
| Section title | 30–34 px | Semibold | 38–42 |
| Primary body | 27–30 px | Regular/Medium | 36–40 |
| Control label | 24–27 px | Medium | 30–34 |
| Metadata | 21–24 px | Regular | 28–30 |
| Footer/debug | 18–20 px | Regular | 24–26 |

Rules:

- 不使用全大写作为普通 section title；
- 英文与中文使用同一视觉层级而非同一固定字号；
- 标题最多 2 行，metadata 1 行；
- locale 变化必须保留安全宽度，不把时间 / 页数挤成半词。

## 3.7 图标系统

- 线性 icon，2 px 视觉 stroke；
- 同一套端点、转角、viewBox；
- icon glyph 28–36 px，外层 hit box 88 px；
- 常用功能可 icon-only：menu、back、add、more、search；
- 不熟悉动作必须 icon + label 或 tooltip-like temporary label；
- filled icon 只用于强语义状态（favorite、downloaded）或 pressed；
- 不要引入十几种风格不一致的 Unicode 字符冒充 icon system。

## 3.8 E Ink 动态规范

- 状态变化使用 discrete repaint，不做 slide/fade/spring；
- 不使用透明 scrim、blur、frosted glass；
- pen-down 时禁止 full refresh；
- 只 repaint 必需区域；
- 大面积 Ink100 surface 只允许短暂 pressed 或必要 modal；
- chrome 退场要恢复干净 canvas，不把 UI 烘焙进 note；
- 所有截图通过不代表笔体验通过，必须保留 physical Marker gate。

---

# 4. Core Slice 1.1 — Correction Pass 详细规范

## 4.1 目标

在不改变 note format、single-page architecture 和 native input ownership 的前提下：

1. 消除 tool / color state mismatch (已在 commit 52ae55e0 中完全解决)；
2. 让 revealed toolbar 更轻、更稳定 (已在 commit f742730e、d7c52858 中收轻并优化)；
3. 修正 Gallery / `+` / Drawer 三个 QML 视觉问题 (已在 commit d7c52858 中完全修复并通过验证)；
4. 保持现有笔迹、橡皮擦、first-stroke、save、exit、recovery 全部不回退。

## 4.2 Editor 状态模型

### Canonical state

必须只有一个 canonical source：

```text
activeTool        = P1 | P2 | Eraser
activeColor       = Black | Gray | White (only if actually supported)
lastPenTool       = P1 | P2
lastPenColor      = Black | Gray | White
chromeVisible     = true | false
chromeReason      = user | tool-change | color-change | writing | fixture
retreatDeadline   = monotonic timestamp | none
penDown           = true | false
```

### Invariants

1. 实际绘图 tool 与 selected tool UI 必须来自同一 state。
2. 实际颜色与 selected color UI 必须来自同一 state。
3. Eraser 可以记住最后一个 pen/color，但 UI 必须显示当前是 Eraser。
4. 任何 tool/color action 完成后必须触发完整的 chrome dirty region repaint。
5. Snapshot restore 不得把旧 selected state 覆盖回去。
6. retreat timer 不在 `penDown=true` 时触发。
7. 用户正在操作 toolbar 时不自动隐藏。
8. 写完一笔后约 1.5 秒退场；工具切换后 timer 重置。
9. re-reveal 后展示最终真实 tool/color，而不是进入 editor 时的初始值。
10. savePage 只能保存 chrome-free canvas。

### Event table

| Event | State change | Repaint |
|---|---|---|
| Reveal handle tap | `chromeVisible=true`, reason=user | top bar + rail |
| P1/P2 tap | update `activeTool`, `lastPenTool` | full rail selected region |
| Eraser tap | `activeTool=Eraser` | full rail selected region |
| Color tap | update `activeColor`, `lastPenColor` | color group + active pen row |
| Pen down | cancel retreat; canvas input | ink dirty region only |
| Pen up | schedule retreat +1.5s | none immediately |
| Retreat timer | `chromeVisible=false`, reason=writing | restore chrome regions from clean canvas |
| Re-reveal | draw from canonical state | full chrome region |
| Exit | save chrome-free canvas | full shell repaint after release |

## 4.3 Revealed editor chrome 视觉规范

### Top chrome

- Height: 88–96 px；
- Left: Back（88 px hit target）；
- Center/left: notebook title，最多 1 行；
- Right: More（可以暂为 existing action）；
- 背景 Paper；底部不使用粗黑 border；必要时 1 px Ink30；
- clean state 下完全隐藏，仅保留 compact handle。

### Tool handle

- Hit box: 88 × 88 px；
- Visible glyph: 30–34 px；
- 可用细线 pen/tool icon，不显示黑色方块；
- 靠左中部，但不能占用实际书写大区域；
- clean state 可见，Ink70；pressed 短暂反白。

### Tool rail

- Width: 80–88 px；
- Item height: 80–88 px；
- 不做永久深色容器；Paper 背景；
- Active tool：Ink100 icon + 2 px ring / 4 px 短侧标；
- Inactive：Ink70；
- Pressed：短暂反白；
- 分隔仅 1 px Ink30；
- color swatch visible 24–30 px，hit area 64–72 px；
- 不显示 `P1/P2/Erase` 大文字作为最终视觉；文字可在 debug/test mode 保留，但 production 应为一致 icon。

## 4.4 Tool/Color 物理复现矩阵

必须在 disposable notebook 上执行：

| ID | Sequence | 验证 |
|---|---|---|
| T1 | P1 → P2 | 实际线宽、selected state 同步 |
| T2 | P2 → Eraser | 橡皮行为、Eraser 高亮 |
| T3 | Eraser → P1 | 返回 pen，不保留 Eraser 高亮 |
| T4 | Black → Gray | 实际颜色与 indicator 同步 |
| T5 | Gray → White | 仅支持时验证；否则不显示 |
| T6 | Color change → immediate stroke | 首笔颜色正确，无旧 UI 残影 |
| T7 | Tool change → immediate stroke | 首笔工具正确，无延迟 |
| T8 | Tool/color → wait 1.5s | chrome 正常退场 |
| T9 | Re-reveal | 显示最终 tool/color |
| T10 | 快速切换 5 次 | 无旧高亮、rail 缺块、重复绘制 |
| T11 | Back → reopen | 页面完好，状态策略符合定义 |

## 4.5 Notes Gallery cleanup

### Grid

- Horizontal margin: 32 px；
- Column gutter: 24 px；
- Column width: `(954 - 64 - 24) / 2 = 433 px`；
- Preview region: 433 × 500–540 px，允许 crop；
- Thumbnail 本体无结构性黑边；
- 如果低对比内容与 Paper 融合，最多使用 1 px Ink30 edge；
- 不添加 shadow 或灰色外卡片。

### Metadata

- Title: 27–30 px，Semibold，最多 2 行；
- Time/page count: 21–23 px，Ink70/Ink30，1 行；
- favorite/sync glyph: 24–28 px，hit box ≥72 px；
- 只有真实 pending/error 才显示 sync；健康状态隐藏；
- 只有真实 page count 才展示页数。

### `+` affordance

- 可见 glyph: 32–36 px linear plus；
- hit box: 88 × 88 px；
- 默认 Paper + Ink100，不显示永久实心黑方块；
- pressed 可短暂 Ink100 反白；
- 当前仍可进入 existing safe creation flow；template picker 在后续 Slice。

## 4.6 Drawer cleanup

Slice 1.1 不改最终 IA，只清理视觉：

- Width 暂维持现有实现或调整到 600–640 px；
- Row 96 px；
- Current item：Ink100 + Semibold；
- 可选 2–4 px、44–56 px 高的短 indicator；
- 禁止整行/全高粗黑 block；
- Pressed 可临时反白；
- boundary 1 px Ink70/Ink30；
- 无透明 scrim；outside tap 关闭。

Inbox / Review / System 暂时保留，标记为 transition debt，不在此 pass 删除。

## 4.7 Slice 1.1 Acceptance

### 自动 Gate

- `git diff --check`
- `build-remarkable.sh`
- `paperctl doctor`
- 现有八张 screenshot runner 全通过
- 新增 focus captures：
  - `09-editor-p1-selected.png`
  - `10-editor-p2-selected.png`
  - `11-editor-eraser-selected.png`
  - `12-editor-gray-selected.png`
  - `13-editor-rereveal-final-state.png`
  - `14-gallery-cleanup.png`
  - `15-drawer-cleanup.png`
- 最后 `paperctl recover` 且 `xochitl=active`

### 人工 Gate

- T1–T11 全部通过；
- pen-down 无 full refresh；
- first stroke 不比当前已知 good build 差；
- normal Back 保存退出；
- Gallery preview 不包含 chrome；
- valuable notebook 不用于测试。

### Definition of Done

- P0 = 0；
- P1 只允许明确 deferred；
- worktree clean；
- changes committed；
- physical test video / note retained；
- Antigravity delta review = PASS 或 PASS WITH WARN；
- 不出现 storage-format diff。

## 4.8 Clean PR #27 device gate（2026-07-12）

**Verdict: BLOCKED.** 真机验证使用 PR #27 远端精确 HEAD
`cc122d308bbeb96cf027e5bc45fc7370d073301b`；交叉构建产物 SHA-256 为
`599c9525d3b4b3556eb01c4f5ce84eeb1947b91c73d545f334b8913462d6dd89`，
设备 `/home/root/paperos/paperos` hash 与本地产物一致。

| Gate | Result | Evidence / note |
| --- | --- | --- |
| build、launch、normal exit | PASS | `build-remarkable.sh`；退出后 `xochitl` / `rm-sync` active |
| Drawer open / outside close / navigation | PASS | semantic bridge + device captures |
| Gallery load / preview / editor return | PASS | `01`–`11` Slice 1 capture set |
| toolbar 无 auto-retreat experiment | PASS | reveal 后等待 2 秒仍为 `editor.tools.revealed` |
| physical pen tool / color / actual stroke match | BLOCKED | bridge 不能替代真实 stylus 操作 |
| note metadata locale | **FAIL** | 真机稳定显示 `pmUTC` / `amUTC` |

`pmUTC` 根因已定位到 `NoteStore.cpp` 的
`modified.toString("MMM d at h:mm AP")`：未转义的日期格式字符把 AM/PM 与
timezone token 混入了本应为文字的 `at`。下一次代码 pass 必须输出例如
`Updated Jul 11, 4:02 PM`，加入确定性回归测试，并重新跑 PR #27 真机 gate。
在该 FAIL 和真实 stylus gate 关闭前，PR #27 不得 un-draft。

---

# 5. Core Slice 2 — Unified Home/Today 详细规范

**开始条件：** Slice 1.1 已合并，toolbar bug 物理 Gate 通过。

## 5.1 产品目标

把当前“6-tab 小应用”进一步转为三层 PaperOS：

```text
Layer 1 · System
Today · Notes · Tasks · Documents · Settings

Layer 2 · Content area
Notes: Recent · All · Folders · Favorites
Tasks: Today · Upcoming · Projects（后续）
Documents: Recent · PDFs · Imported（后续）

Layer 3 · Notebook
Editor · Page Overview · Outline · Search in notebook（后续）
```

本 Slice 只完成 Layer 1 的收敛与 `Today` landing。

## 5.2 最终 Drawer IA

用户可见目的地：

1. **Today** — daily landing；内部 route `homeToday`
2. **Notes**
3. **Tasks**
4. **Documents**
5. **Settings**
6. 底部：Return to reMarkable

规则：

- Home 与 Today 合并，用户只看到 `Today`；
- Inbox / Review / legacy System 不再是一级目的地；
- 暂不删除旧实现，保留 internal route 以便迁移；
- Review 的功能可未来映射为 Tasks 内的 review queue；
- Inbox 的内容可未来映射 Documents / Tasks，但本 Slice 不做业务迁移；
- Drawer 不是收藏/最近切换器；Quick Switcher 后续单独实现。

## 5.3 Today Landing 页面结构

**不使用中央大卡片，不做 Dashboard grid。整个屏幕就是画布。**

### Screen anatomy

```text
┌──────────────────────────────────────┐
│ Menu      Fri, Jul 10          status│  104–112
├──────────────────────────────────────┤
│ Continue writing                     │
│ [wide recent notebook paper object]  │  260–320
│                                      │
│ Recent notes                  View all│
│ [thumb]              [thumb]         │  420–480
│                                      │
│ Tasks                         View all│
│ ○ Task row                           │
│ ○ Task row                           │  260–320
│ ○ Task row                           │
│                                      │
│ Documents                     View all│
│ recent document row / empty hint     │  remaining
│                                      │
│ offline/error only                   │
└──────────────────────────────────────┘
```

### 内容策略

- **Continue writing**：最多 1 个最近真实 notebook；没有时显示轻量 `Create a note` 行，不做大 empty card。
- **Recent notes**：最多 2 个 paper thumbnails；`View all` 进入 Notes All。
- **Tasks**：最多 3 条，保持 divider-separated rows，不做每条 task card。
- **Documents**：最多 2 条 recent docs；没有真实 data source 时整个 section 隐藏，而不是展示假内容。
- **Sync**：健康状态隐藏；offline/error 只在底部显示 non-blocking status。
- **Search**：Search backend 未实现前，不展示假搜索框。可以保留未来布局槽位，但 production 隐藏。

### 滚动策略

目标是单屏完成 daily glance：

- 优先限制内容数量，而不是无限 scroll；
- 如果内容溢出，section 使用 `View all` 导航；
- 不在 Today 内使用 nested scroll；
- 不做横向 carousel；
- 不做持续动画或 skeleton shimmer。

## 5.4 Task rows

- Row height: 88–96 px；
- Divider: 1 px Ink30；
- Checkbox / status target: 72–88 px；
- 标题 27–30 px；
- 时间 / project metadata 21–23 px；
- overdue 用文本/Ink100，而非彩色红；
- completed 降为 Ink30/Ink70，但仍可读；
- 不改变 task domain 或 completion persistence，UI 只消费现有 truth。

## 5.5 Documents rows

- 不使用 mini card；
- 左：document type icon 28–32 px；
- 中：title + modified info；
- 右：optional sync/error icon；
- Row 88–104 px；
- divider 1 px Ink30；
- 无 Documents data 时隐藏 section，而不是开发 fake PDF list。

## 5.6 Today empty/error states

| 状态 | UI |
|---|---|
| No notes | `Create your first note` text row + add glyph |
| No tasks | `Nothing scheduled today`，不占大块空间 |
| No documents | section hidden |
| Offline with cache | 内容照常；底部 `Offline · showing saved data` |
| Sync failed | 底部可点击 status，Ink100 icon + 文本 |
| No cache | 清楚说明 `No saved data yet`，提供 Sync action |
| Loading | 尽量使用稳定占位行，不做 shimmer |

## 5.7 Slice 2 Screenshot Matrix

- `20-today-populated.png`
- `21-today-no-notes.png`
- `22-today-no-tasks.png`
- `23-today-offline-cache.png`
- `24-today-sync-error.png`
- `25-system-drawer-final-ia.png`
- `26-today-open-recent-note.png`
- `27-today-open-task-list.png`
- `28-today-open-documents.png`（仅真实 route/data 可用时）

## 5.8 Slice 2 Acceptance

- Home / Today 不再作为两个一级 route；
- Drawer 一级 IA 只有 5 个产品目的地 + exit；
- Today 页面无大 outer card、无 nested card；
- Continue writing、Recent notes、Tasks 均使用真实 data；
- Documents 无能力时隐藏；
- healthy sync 隐藏；
- offline 不阻塞内容；
- 一屏可完成 daily glance；
- 所有 section 有 semantic `objectName`；
- 不改 NoteStore format；
- 不实现 Search / multi-page；
- build、device capture、xochitl recovery 通过。

## 5.9 Clean PR #28 device gate（2026-07-12）

**Verdict: BLOCKED.** 真机验证使用 PR #28 远端精确 HEAD
`3fa85277a3c985981dafbc24afff83a9d8ee324d`；交叉构建与设备 promoted binary
SHA-256 均为
`2e36f6ce84398d694e986331d4cda94e498739811a5486aafe73250b3c68b47e`。
该 HEAD 额外包含与 PaperOS 无关的 Fitness commit `3fa85277`，合并前也必须清理 scope。

| Gate | 结果 | 设备结论 |
| --- | --- | --- |
| Today default + Main / Drawer index | PASS | page=`today`、moduleIndex=`0` |
| Notes / Tasks / Documents / Settings routes | PASS | final Drawer IA semantic matrix 通过 |
| Create note → editor exit → Today refresh | PASS | 新 note 后 visible Gallery 3→4，立即成为 Continue item |
| Edit with physical pen → Today refresh | BLOCKED | 真实 stylus 输入未执行 |
| Tasks real data / full-page mixed CJK | PASS | 真实 dashboard tasks；full Tasks 两行安全换行 |
| Tasks empty state | NOT TESTED | 设备存在真实 tasks，当前 bridge 无 no-data fixture |
| Today task preview | **FAIL** | 英文与中英混排长标题均单行省略 |
| Documents unavailable state | PASS | `Documents are not available in this build`，无假数据 |
| Continue / Recent note density | **FAIL** | Recent tiles 高度过大，存在大面积无信息空白 |
| Date / locale | **FAIL** | Today 日期正常；note metadata 仍泄漏 `pmUTC` / `amUTC` |
| Settings route / layout | PASS / **FAIL** | route 可达；分隔线与 Sync / Display / Device 内容重叠 |
| Duplicate navigation | PASS | 选择当前 route 只关闭 Drawer，index 保持 0 |
| Back / physical ghosting | NOT TESTED / BLOCKED | bridge 无 Back 注入；capture 不能替代相机/现场观察 |
| Exit / recovery | PASS | `paperos` inactive；`xochitl`、`rm-sync` active |

PR #28 保持 stacked draft；不得在 PR #27 formatter + stylus gate、上述视觉 FAIL、
以及无关 commit scope 全部关闭前 un-draft 或合并。

---

# 6. 文件与所有权映射

## Slice 1.1

| Work | Owner | Primary files |
|---|---|---|
| Tool/color state bug | GPT-5.6 Sol | `InkModeController.h/.cpp`, bounded `TestBridge` |
| Native rail visual reduction | GPT-5.6 Sol | `InkModeController.cpp` |
| Gallery border / add button | Cursor Auto | `NotesPage.qml` |
| Drawer active state | Cursor Auto | `SystemDrawer.qml` |
| Tokens only if needed | Cursor Auto | `main.cpp` existing Ui injection |
| Device gate | Codex/Sol + Ken | scripts + physical Move |
| Visual delta review | Antigravity | report only |

## Slice 2

| Work | Owner | Primary files |
|---|---|---|
| IA / contracts / acceptance | GPT-5.6 Sol short planning/review | docs + routes |
| QML implementation | Cursor Auto | `Main.qml`, `SystemDrawer.qml`, new `HomeTodayPage.qml` |
| Reuse Today/task components | Cursor Auto | `HomePage.qml`, `TodayPage.qml` extraction |
| Data / route wiring | Codex Terra | existing read models / bridge |
| Device screenshots | Codex Terra | capture scripts |
| Visual QA | Antigravity | report only |

### No-touch during Slice 2

- `InkModeController.*` unless a proven regression；
- Note physical format；
- multi-page proposal；
- production write enablement；
- xochitl / boot patch；
- Search / OCR pipeline。

---

# 7. Agent 执行顺序（省额度版）

## Step 1 — Ken 记录最短复现（10–15 min）

记录：

```text
Open disposable notebook
→ reveal tools
→ exact tool/color sequence
→ expected tool/color
→ actual ink behavior
→ visible selected state
→ rail corruption / stale pixels
→ whether retreat works
```

附手机视频；不要只写“偶尔有问题”。

## Step 2 — GPT-5.6 Sol 修 P0（45–120 min）

只处理 native tool/color canonical state、dirty region、snapshot/retreat ordering 和 rail 轻量化。

**停止条件：** physical reproduction 消失 + T1–T11 pass。

## Step 3 — Cursor Auto 做 QML cleanup（30–90 min）

只改：

- thumbnail border；
- `+` affordance；
- drawer active state。

不得触碰 `InkModeController`、NoteStore、TestBridge native behavior。

## Step 4 — Antigravity delta QA（30–45 min）

只审：

- drawer；
- gallery；
- editor revealed state；
- focused tool/color captures。

最多提出 3 个 must-fix，不重新审整个 vision roadmap。

## Step 5 — Merge readiness（20–45 min）

Codex Terra 检查：

- target branch divergence；
- storage format；
- test-only fixture exposure；
- screenshot artifacts；
- build / recovery；
- PR 内容与 evidence。

## Step 6 — Slice 2（1–3 days）

- Sol 先输出文件级 plan 与 IA invariants；
- Cursor Auto 实现 QML；
- Codex Terra 接数据和测试；
- Antigravity 终审。

---

# 8. Handoff Prompt — Cursor Auto：Slice 1.1 Visual Cleanup

```text
Implement a bounded PaperOS Core Slice 1.1 visual cleanup.

Do not modify native ink, InkModeController, TestBridge, NoteStore,
storage, route architecture, or product IA.

Read:
- PAPEROS_NEXT_UI_UPDATE_GUIDE_2026-07-10.md (repo: docs/qa/paperos/ui-spec.md)
- docs/archive/paperos/milestones-2026-07.md
- current device screenshots
- applicable AGENTS.md

Scope only:

1. Notes Gallery thumbnails
   - remove the heavy structural black card border;
   - make each thumbnail read as a paper object;
   - use no border by default, or at most 1px Ink30 if the device needs
     edge separation;
   - keep real title, time, page and sync data truthful;
   - preserve the two-column grid and semantic IDs.

2. New-note affordance
   - replace the permanent solid-black square with a linear plus glyph;
   - retain an 88x88 invisible/quiet touch target;
   - use temporary inverse fill only while pressed;
   - do not implement templates.

3. Drawer current state
   - replace the thick active black block with Ink100 text + Semibold;
   - an optional short 2–4px indicator is allowed;
   - retain a clear pressed state;
   - do not change destinations or finalize Home/Today IA in this pass.

Use only Paper / Ink100 / Ink70 / Ink30.
No shadows, transparency, animations, new nested cards, or unrelated cleanup.

Run:
- git diff --check
- canonical build
- focused device screenshots for drawer and Notes Gallery
- paperctl recover

Return:
- verdict
- files changed
- before/after screenshots
- build result
- commit SHA
- device-only uncertainties
```

---

# 9. Handoff Prompt — Cursor/Codex：Core Slice 2

```text
Own PaperOS PAPR.UI Core Slice 2: Unified Today landing and final
Layer-1 system IA.

Read:
- PAPEROS_NEXT_UI_UPDATE_GUIDE_2026-07-10.md (repo: docs/qa/paperos/ui-spec.md)
- docs/qa/paperos/ui-spec.md
- current Core Slice 1.1 device screenshots
- applicable AGENTS.md files

Mission:

Replace the transitional Layer-1 navigation with:
Today · Notes · Tasks · Documents · Settings

Finalize Home/Today IA by ensuring the unified HomeTodayPage has the current date / Today as the user-facing title (not a dashboard card), and removing duplicate destinations from the Drawer.

Required Today sections:
- Continue writing: one real recent notebook
- Recent notes: maximum two real paper thumbnails
- Tasks: maximum three real task rows
- Documents: maximum two real documents, or hide the section if no real
  read model exists
- offline/error status only when needed

Constraints:
- entire screen is the canvas;
- no outer card and no nested card system;
- no permanent search field before Search exists;
- no fake notes, tasks, documents, page counts or sync states;
- no nested scrolling; cap content and use View all;
- retain legacy Inbox/Review routes internally but remove them from primary
  drawer IA;
- do not touch InkModeController, note format, multi-page storage, Search,
  OCR, templates, Quick Switcher or Control Center;
- use Paper / Ink100 / Ink70 / Ink30 and the exact spacing/type guidance in
  the UI update guide;
- preserve all semantic TestBridge routes or replace them with documented
  new semantic IDs.

Execution:
1. inspect current data sources and route contracts;
2. define a file-specific plan and invariants;
3. continue into implementation;
4. build and run focused tests;
5. deploy through paperctl;
6. produce the Slice 2 screenshot matrix;
7. recover xochitl.

Done when:
- Home and Today are one primary destination;
- drawer has five final product destinations plus exit;
- Today is readable in one glance without dashboard chrome;
- all visible data is real;
- offline remains non-blocking;
- build, screenshots and recovery pass;
- no deferred epic enters the diff.
```

---

# 10. Deferred Roadmap（不要混入下一 PR）

## Slice 3 — Multi-page foundation

先做 data，再做 UI：

1. opaque page IDs；
2. manifest-authoritative ordering；
3. atomic create/duplicate/move/delete；
4. lazy reversible migration；
5. crash-safe journaling；
6. device storage gate；
7. 然后才是 Page Overview。

当前设备技术 Gate 已指出 single-page `page-001.png` 直接覆盖不是原子写，且设备 root free space 紧张，因此不能在纯 UI PR 中偷渡 migration。

## Slice 4 — New Note / Templates

- Blank / Ruled / Dotted / Last used；
- visual preview；
- tap template = immediate create；
- title 仍可创建后再命名；
- template data 必须真实，不做静态假图入口。

## Slice 5 — Search / OCR / Tags

Handwriting Search 是独立 L/XL Epic：

```text
stroke/page data
→ OCR / recognition
→ searchable index
→ notebook/page result
→ hit geometry
→ exact-page navigation
→ highlight presentation
```

reMarkable 已提供 handwriting search、tags 和 typed/handwritten content search，证明这是合理 north star；但它不是“加一个搜索 UI”即可完成的功能。[R4][R5][R7]

## Slice 6 — Quick Switcher / Control Center

- Quick Switcher：recent/favorite content；
- Control Center：brightness、Wi-Fi、sync、battery；
- 两者都是 temporary surfaces；
- 不重新引入 permanent rail 或 bottom bar。

---

# 11. Final Definition of Quality

PaperOS 达到目标，不是因为“看起来像概念图”，而是因为：

- 打开设备后用户知道今天要做什么；
- 进入 Notes 后能快速识别真实笔记；
- 写字时 canvas 占绝对主导；
- 工具随叫随到、用完退场，状态永远诚实；
- 页面没有不必要的容器、边框和 dashboard 感；
- 没有因追求视觉而牺牲 first stroke、局部刷新、保存和 recovery；
- 每个新能力都建立在真实数据与可恢复架构之上。

**最终判断口诀：**

```text
Does it feel like paper?
Can I tell what is current?
Can I act without guessing?
Does the control leave when I no longer need it?
Is every displayed state true?
Does it survive the physical device gate?
```

---

# 12. Sources

## Repository sources

- `docs/archive/paperos/milestones-2026-07.md`
- `docs/qa/paperos/ui-spec.md`
- `docs/qa/paperos/ui-spec.md`
- `docs/archive/paperos/milestones-2026-07.md`
- `docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`
- `docs/ui-qa-screenshots/paperos/device/latest/`

## Official external research

- **[R1]** reMarkable — About reMarkable Paper Pro Move
  https://support.remarkable.com/s/article/About-reMarkable-Paper-Pro-Move
- **[R2]** reMarkable — Paper Pro Move specifications / distraction-free product positioning
  https://remarkable.com/products/remarkable-paper/pro-move/details/features
- **[R3]** reMarkable Support — Navigating on your reMarkable
  https://support.remarkable.com/articles/Knowledge/Navigating-on-your-reMarkable
- **[R4]** reMarkable Support — Handwriting Search
  https://support.remarkable.com/s/article/Handwriting-search
- **[R5]** reMarkable — Features: folders, tags, search, templates
  https://remarkable.com/products/remarkable-paper/pure/details/features
- **[R6]** W3C WAI — WCAG 2.2 Target Size (Enhanced)
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
- **[R7]** reMarkable — Releases 3.0–3.3: typed text, notebook search, gestures
  https://remarkable.com/blog/software-updates-3-0-3-3-typed-text-comes-to-remarkable
- **[R8]** reMarkable Blog — Calm Tech / software release archive
  https://remarkable.com/blog
