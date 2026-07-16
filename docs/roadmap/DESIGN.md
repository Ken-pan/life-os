# Design System 主线（DSGN.* · legacy `D-*`）

Hub 状态见 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。**Canonical ID：** [`TICKET_NAMING.md`](./TICKET_NAMING.md) · `DSGN.CATALOG.*`

**战略：** token-first / code-first / visual-test-first。`design-tokens` 为真源 → generated CSS → apps + design-catalog preview。

> **改了共享视觉？基线必须走 canonical（2026-07-14 踩坑实录）：** 像素基线只有用
> `npm run test:design-catalog:snapshots:canonical`（固定 Playwright docker 镜像）生成才算数 ——
> 本地 macOS `--update-snapshots` 出来的基线在 CI 会挂（字体/AA 差异）。
> **那次是怎么烂掉的：** `f0b324b5` 一次提交里同时干了两件事 —— 滚动条 `scrollbar-gutter: stable`
> 让内容宽 1440→1430（**82 张基线全过期**），以及 `.btn-danger` 改 `color-mix()` tint
> （computed 变 `color(srgb …)` 语法，a11y 助手解析不了 → 报 0.00:1 假失败）。
> **a11y 先挂 → snapshots 步骤压根没执行 → 基线过期被完全掩盖，master CI 长红 5+ 次推送没人察觉。**
> 教训：① 加/改共享原语时同批跑 canonical 基线；② CI 里 **a11y 会挡住 snapshots**，
> 看 CI 别只看最后一行结论，要看哪一步先挂。
>
> **加一个 showcase 怎么加（2026-07-14 起已收敛）：** 只改 `catalogNav.js`（CATALOG_SECTIONS
> + MATRIX_SHOWCASES）+ `showcaseStates.js`（状态 + 矩阵高度）+ `App.svelte`（pages 映射）
> + 新建 `*Showcase.svelte`。**测试侧不用动** —— `tests/visual/design-catalog.helpers.ts`
> 从 catalog 自身注册表派生列表与默认状态。

---

## 已完成：D-P0 – DSGN.CATALOG.6

| 阶段                     | 日期       | 摘要                                                                        |
| ------------------------ | ---------- | --------------------------------------------------------------------------- |
| **D-P0** Catalog         | 2026-07-08 | `apps/design-catalog` 端口 5190；showcases + smoke                          |
| **D-P1** Tokens          | 2026-07-08 | `packages/design-tokens`；4 生产品牌                                        |
| **D-P2** 品牌双轨清理    | 2026-07-08 | 四生产站 `data-app`；`:root` 品牌改 generated；`tokens.css` generated       |
| **D-P3** 组件 token 化   | 2026-07-08 | Card / Settings / Toast / Nav / Banner / Button / Segment / Toggle          |
| **D-P3c** Primitives     | 2026-07-08 | `.btn-*` / `.seg` / `.settings-toggle` → component tokens                   |
| **D-P4** Matrix + states | 2026-07-08 | 4×2 grid；`showcaseStates`；CommandPalette showcase                         |
| **D-P5** Pixel baseline  | 2026-07-08 | 80 desktop snapshots；smoke/snapshot 分离                                   |
| **DSGN.CATALOG.6** a11y gates      | 2026-07-08 | contrast / focus / touch / reduced-motion；`test:design-catalog:a11y` 47/47 |

### 验收（2026-07-08）

| 检查                                    | 结果       |
| --------------------------------------- | ---------- |
| `npm run validate:tokens`               | ✅         |
| `npm run test:design-catalog`           | ✅ 172/172 |
| `npm run test:design-catalog:a11y`      | ✅ 47/47   |
| `npm run test:design-catalog:snapshots` | ✅ 80/80   |
| GHA design-catalog job                  | ✅         |

### P3 组件覆盖（终态）

| 域                        | platform-web | tokens                | catalog | smoke |
| ------------------------- | ------------ | --------------------- | ------- | ----- |
| Card                      | ✅           | ✅ `card.*`           | ✅      | ✅    |
| Settings                  | ✅           | ✅ `control.*`        | ✅      | ✅    |
| Toast / Banner            | ✅           | ✅ `feedback.*`       | ✅      | ✅    |
| Navigation                | ✅           | ✅ `navigation.*`     | ✅      | ✅    |
| CommandPalette            | ✅           | ✅ `commandPalette.*` | ✅      | ✅    |
| PortraitGate              | ✅           | ✅ `portraitGate.*`   | ✅      | ✅    |
| Button / Segment / Toggle | theme        | ✅                    | ✅      | ✅    |

**刻意不做：** production 页面迁移；业务 card（TaskCard 等）；Storybook。

Commit 锚点 → [`SHIPPED.md`](./SHIPPED.md) §Design

---

## 前瞻：DSGN.CATALOG.7+

| 阶段     | 内容                           | 触发 / 范围                                                                     |
| -------- | ------------------------------ | ------------------------------------------------------------------------------- |
| **DSGN.CATALOG.7** ✅ | production 共享 primitive a11y | ✅ 2026-07-16 发货：`npm run qa:prod-a11y`（`scripts/lifeos-prod-a11y-spotcheck.mjs`），生产四站构建 × light/dark 抽检标题/导航对比度 + 44px 触控 + focus-visible；首跑 62 pass / 0 fail |
| **D-P8** | Storybook / Chromatic          | 团队协作压力（现阶段否决）                                                      |

**2026-07-16 追加护栏：** `npm run check:design-catalog-registry`（showcase 四处注册机器对账，进 CI）；
像素基线扩到 **226 张**（新增 overlay/forms showcase + 32 张 393×852 mobile 基线；
同日 ROI 补全加 progress/selection/tabs 24 张、chips/stat 16 张、lists/display/disclosure 24 张）。

**2026-07-16 前瞻组件波（为 healthos/brainos/noteos/shopos 预铺，对照 Material/HIG/Polaris）：**
theme 新增 9 组展示/结构原语——`.avatar`（尺寸/首字母/组叠）、`.stepper`（配 platform-web
`QuantityStepper`，shopos 数量/healthos 剂量）、`.table`（striped/hover/sticky/`.num`）、
`.list`（leading/body/trailing，button/a 自动可点）、`.accordion`（native details 零 JS）、
`.timeline`（语义色节点）、`.breadcrumbs`、`.rating`、`[data-life-os-tooltip]`
（纯 CSS，仅 hover 环境，长解释仍走 ExplainPanel）。
catalog 新增 lists/display/disclosure 三个 showcase + selection 的 stepper 态；
smoke 405 / a11y 48 / canonical 202 项全绿。

**同日补充：** 再加 `.steps`（向导步骤）/ `.pagination` / `.dropzone` / `.kbd` / `.divider`
五组小原语，全部挂进既有 showcase 新状态（零新增基线名）。
**a11y 门禁 48→77：** 新控件补齐 contrast（chip.tag ×8）/ focus（checkbox/tab/chip/pagination ×2）/
touch（option-row/list-item/accordion ×4）/ reduced-motion（indeterminate progress）。
门禁首跑即抓到真问题——planner light 的 accent-on-subtle 不足 3:1，
已把 `.chip.tag`/`.badge--accent`/`.avatar`/`.chip--on`/`.pagination` 当前页统一改为
`color-mix(accent 72%, t1)` 墨水色（明暗两模式对比度同时提升）。

**2026-07-16 ROI 组件补全：** 按各 app 手写重复次数排序下沉——
① `.progress` 进度条（13 处手写）② `CheckboxField`/`RadioGroupField` + `.checkbox`/`.radio`/`.option-row`（12 处）
③ `SliderField` + `.slider`（finance 下沉，5 处）④ `SearchField` + `.field-search`（12 处手写搜索框）
⑤ `LifeOsTabs`/`LifeOsTabPanel` + `.tabs`/`.tab`（finance HorizontalTabs 下沉，8 处）。
第二批：⑥ `.icon-btn` 图标按钮（25 文件手写，finance `.icon-btn` 下沉）
⑦ `.stat` KPI 瓦片（18 文件手写；栅格复用既有 `.life-os-grid--kpi`）
⑧ `.chip` 交互态（filter `aria-pressed` + `.chip__remove` 可移除 tag + `.chip-row`，7 文件手写）。
刻意跳过：fitness 重量 stepper（本文档既有方针「领域内容留 app」）、avatar（多为 music 封面图，非通用头像）。

**2026-07-16 生产迁移第一波（finance）：** HorizontalTabs/TabPanel 本地组件删除、
6 视图改 import 共享 `svelte/tabs`（`LifeOsTabs as HorizontalTabs` 别名保持 diff 最小）；
app.css 删页签/滑杆基座共 −152 行，上下文覆盖改名 `.horizontal-tab*`→`.tab*`、
`.slider-value` 只留 accent 强调色一行覆盖；`fields/SliderField` 变薄封装（保留 finance 默认 step=25）。
已验证：build + svelte-check 0 错 + vitest 117/117 + 真机预览（首页/预测/设置页签切换、长期规划滑杆拖动）。
**2026-07-16 生产迁移第二波（进度条）：** 全仓 `role="progressbar"` 实测 8 处（此前 grep 粗估 13 处虚高）。
已迁 3 处：planner TodayProgressCard（暖色渐变留 app 一行覆盖）、planner triage、music 设置歌词维护
（不定态下沉为 theme `.progress--indeterminate`，reduced-motion 降级半透明满条）。
带理由跳过 3 处：finance BudgetPulseCard（超支配色 + 时间线游标，领域件）、fitness FocusSession
（沉浸态顶部 chrome 定位 + 白透明轨道）、aios Message TTS（28px 微型内联件）；home/tidy 2 处当日有并行会话在改，未动。
验证：planner/music build + check 0 错、planner vitest 126/126、planner 首页实测 50% 渐变条、catalog 不定态实测；
顺手消掉 planner/music 各 1 处 raw-motion 存量（护栏提示可收紧，等 home 并行改动落地后再 --update）。

**2026-07-16 生产迁移第三波（checkbox）：** 已迁 7 处——planner triage（`.option-row`+`.checkbox`，
删 12 行局部 CSS）、planner TaskEditorSheet 子任务、portal PortalSettings、finance DecisionStudio ×4
（`label.item` 行加 `.checkbox` 类）。验证：planner/finance/portal build+check 0 错，
vitest 117+126 全绿。跳过：finance 台账行选择 checkbox（AccountRow/HistoryLedger 等密排布局，
20px 控件有挤压风险）、aios composer「新任务」（11px 微型件）。

**逐项检视后降级不迁（粗估 ROI 未经受住实地检查）：**
- search 12 处 → 全部是工具栏领域件（focus ref 管理 / 图标组件 / 密度调优），迁移成本 > 去重收益；
  `SearchField` 定位为新表单场景使用。
- stat 瓦片 → fitness 的 disp 数字 + mono 大写标签是品牌身份（贯穿 SummaryView），
  finance `.kpi` 已是 app 内统一体系；非意外重复，不迁。
- finance `.icon-btn` 基座 → `.primary` 变体 + 10 处上下文覆盖，回归面大，暂缓。
- home/tidy 进度条 2 处 + checkbox 3 处 → 并行会话当日持续在改 home（styles 护栏计数还在涨），落地后再迁。
生产页面迁移仍刻意不做（同 P3 方针），apps 后续按需替换。
坑：`.field input`（0,1,1）会压过自绘控件 0,1,0 的宽度/边框——已用 `:where(:not(…))` 零特异性排除。

**说明：** **DSGN.CATALOG.6**（design-catalog a11y gates）已于 2026-07-08 发货 ✅。hub 不再将 DSGN.CATALOG.6 列入 §Next。

**已砍掉：** ~~DSGN.CATALOG.7 Figma variables mirror~~ — 项目无 Figma。
