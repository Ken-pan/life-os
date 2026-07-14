# FinanceOS 全页面 UI/UX 走查 — 2026-07-14

## 方法与范围

登录门需要轮换的 QA 密钥,本次走查未进入 live app,采用**代码级走查**:逐页读组件模板 + `app.css` 样式基座 + IA 配置,按可用性 / 一致性 / 层级 / 反馈 / 可访问性 / 空态错态 / 响应式来评。像素级复核(逐页截图)需要有人先在预览里登录,可后续补。

覆盖页面(8 类 tab):

| Tab (路由) | nav 标签 | 主视图 | 子分区 |
|---|---|---|---|
| home | 首页 | HomeHubView → TodayView / OverviewView | 今日 / 总览 |
| accounts | 账户 | AccountsView | — |
| history | **记录** | RecordsView | 洞察 / 固定 / 大额 |
| stocks | 资产配置 | StocksView | — |
| forecast | 预测 | ForecastHubView | 预测 / 情景 |
| decision | 决策 | DecisionStudioView | 对比 / 已存 / 记录 |
| review | 审查 | ReviewView | 导入 / 队列 / 基线 / 校准 / 对账 |
| settings | 设置 | SettingsView | 假设 / 应用 / 帮助 |
| — | (auth) | AuthGate | 登录 / 设备上限 / 配置缺失 |

---

## 执行摘要 — 按影响排序

| # | 类别 | 问题 | 影响 |
|---|---|---|---|
| G1 | IA | 移动底栏放了「审查」却把高频的「记录/记一笔」折进 More | 高 |
| A1 | 触摸 | 主页待确认项的行内操作用 <44px 的下划线微型按钮 | 高 |
| D1/D3 | 层级 | Today / Overview 单页信息过载,纯文字长列表堆叠 | 高 |
| G5/S1 | 一致性 | 破坏性操作确认策略不统一;Decision 空态缺失 | 中 |
| A2 | 可访问性 | help tooltip 无边界处理,右缘可能溢出裁切 | 中 |
| D2/S3 | 反馈 | 解释性长文案塞进 tooltip;关键操作后立即 reload 盖掉结果反馈 | 中 |

---

## 一、全局 / 信息架构

**G1 — 移动底栏的取舍值得商榷 [高]**
`nav.ts:2` 定义移动 primary tabs = `home / accounts / forecast / review`,其余(记录、资产配置、决策、设置)进 More Sheet。
- 「记录」承载交易流水浏览 + 「记一笔」快速录入(`history/[section]` 的 `onQuickAdd` → TxnEntryDrawer),对记账类财务 app 属高频;却要 More → 记录 → 展开 quick add,3 层路径。
- 反观「审查」(导入 CSV / 对账 / 校准管线)是低频批处理,却占底栏主位。
- 建议:底栏用「记录」替换「审查」,审查下沉 More;或补一个常驻 FAB「记一笔」(i18n 里 `fabLogTxn`/`fabLargeCashflow` 已有文案但当前**没有任何组件在用**,疑似废弃或未接线)。

**G2 — 路由与标签命名不一致 [轻]**
`/history` 显示「记录」、`/decision` 页头是「决策工作室」而 nav 是「决策」。用户只看标签,影响小;但 help 中心的「导航深链对照」(`help.navMapTitle`)会把 `/history` 这类 canonical 路径直接展示给用户,读起来对不上。属内部债务,建议路由重命名或在对照表加显示名。

**G3 — 侧栏单项分组冗余 [轻]**
`AppShell.svelte:94` 桌面侧栏「审查」组内只有一个「审查」项(组标题 == 项标题);「设置」组(mobile more,`:108`)同理。单项分组的组标题是视觉噪音,建议合并或去掉组头。

**G5 — 破坏性操作确认策略不统一 [中]**
- 做得好:Settings 的删除全部 / 恢复备份 / 清除 legacy 均要求输入确认词(`DELETE ALL`/`RESTORE`/`CLEAR LEGACY`,`SettingsView.svelte:240/220/154`)。
- 不一致:Decision Studio 删除方案(`removeScenario`,`:771`)、删除决策记录(`deleteDecisionRecord`,`:849`)、Stocks 删除快照(`StocksView.svelte:352`)**直接执行,无确认、无撤销**。同一产品内应统一——高价值/不可逆的删方案至少加一次 confirm 或行内撤销。

---

## 二、逐页

### 今日 (TodayView) — 1030 行,产品核心
- **D1 信息过载 [高]**:有数据后单屏堆叠约 10 个区块(STS、储蓄能力、AI 简报、现金校准条、待确认、现金日历、缺口模拟、账单、值得做、更多工具)。空态有 GettingStartedChecklist 引导,但满态缺乏"优先级折叠 / 渐进披露"——次要卡(缺口模拟、更多工具)可默认收起。
- **A1 触摸目标过小 [高]**:待确认项的「确认发生 · 未发生 · 管理」是 `.occ-micro-btn`(`font-size xs`, `padding:0`, 下划线文字,`TodayView.svelte:620-645`)。这是主页高频操作,手机上三个微型链接挤在一行极易误点。对比:`.btn`/`.text-btn` 都有 `--tap-min`/`--btn-h-*` 的合规高度,唯独这里没有。
- **D2 tooltip 长文案 [中]**:`safeToSpendText()`(`:170`)把整段多句解释塞进 300px 的 help 气泡,移动端难读。建议改「了解更多」行内展开面板(现金校准条已有此模式,可复用)。
- 正向:现金日历 agenda/calendar 双视图、默认 agenda(移动友好);风险日高亮、账单机构 logo、卡片门户直达都不错。

### 总览 (OverviewView)
- **D3 "资金去向"卡密度过高 [高]**:`:194-263` 一张卡里约 12 行 kv(可及/锁定/流动/券商市值/成本/浮盈/税/税后/储备/投资合计/月结余),纯文字纵向堆叠,无视觉分组/缩进层级/图形。是全 app 最难扫读的区块,建议拆成"可及资产 / 券商明细 / 结余"三个带小标题的子块,或加瀑布图。
- 正向:4 KPI 卡 + 驱动因子 Top3 + 目标 ETA 结构清晰。

### 账户 (AccountsView)
- 结构好:搜索 + 5 段筛选(全部/资产/负债/过期/储备)+ 排序下拉 + 机构 logo 堆叠 + 资产/负债汇总;空态与"筛选无结果"态分开(`:237-240`)。
- **V3 [轻]**:展开"添加账户"后是一排 `+ 类型` 的 `.icon-btn`(`:229`),与上方筛选 `seg` 视觉相近,新建入口层级不够突出。

### 资产配置 (StocksView)
- 组织清晰:配置总览 → 投顾 → 明细层(watchlist)→ 次级工具(报价控制 / 历史快照,用 `<details>` 折叠)。空态到位。
- **G5** 快照删除无确认(见上)。
- 正向:快照过期(≥7天)、仅应税、后台暂停报价都有 tag 提示,状态可见性好。

### 记录 (RecordsView → History/CashFlows/FutureCashflow)
- History 洞察默认折叠(`showInsights=false`),Ledger + PurchaseCoverage 默认展示 —— 合理的渐进披露。
- **D4 [轻]**:折叠把"扩展 KPI / 计划 vs 实际"也一起藏了,首次进入洞察前该区偏空。
- 正向:趋势/分类/复现/商户四段窗口切换(月/3月/12月/全部)一致;类目条形图直观。

### 预测 (ForecastHubView) / 决策 (DecisionStudioView)
- Forecast 用 HorizontalTabs 承载 预测/情景,标准。
- Decision "对比"是 4 步向导(选题→预览→对比已存→应用到计划),Apply 前有双重勾选确认(applyAck + staleAck when 数据不新),**这块反馈设计很好**(`:643-679`)。
- **S1 空态缺失 [中]**:"已存"(`:729`)和"记录"(`:833`)的 `{#each}` 没有 `{:else}` 空占位,无数据时是纯空白,新用户不知下一步。
- **G5** 删除方案/记录无确认(见上)。

### 审查 (ReviewView)
- 5 子 tab(导入/队列/基线/校准/对账)线性管线,导入成功后自动跳基线(`:58-61`),流程引导清晰。子组件本次未逐一展开,建议像素级复核时重点看导入向导的错误态。

### 设置 (SettingsView)
- 假设参数分 基础/高级/专家 三层折叠,克制;外观、隐私(金额显隐)、数据备份/恢复/删除、设备管理齐全。
- **S3 反馈被 reload 盖掉 [中]**:`confirmRestore`/`confirmDeleteAll` 成功后立即 `window.location.reload()`(`:229/252`),`dataActionResult` 文案用户几乎看不到。建议先 toast/停顿再刷,或刷新后用一次性提示回显结果。
- 正向:破坏性操作的输入确认词是范式级做法。

### 认证 (AuthGate)
- 登录卡简洁,`autocomplete=username/current-password`、`inputmode=email` 到位,按钮有 busy/verifying 三态文案;device-limit / config-missing 都有专门态。良好。

---

## 三、跨页共性

**A2 — help tooltip 无边界处理 [中]**
`.help-tip-pop`(`app.css:1121`)固定 `left:0; max-width:300px`,无移动端/右缘重定位。help 图标在 KPI 卡头、卡片标题里**大量使用**;当图标靠近视口右缘时,300px 气泡向右展开会超出屏幕被裁(桌面右列卡片、手机右侧都可能中招)。触屏靠 `:focus-within` 可弹出(可用),但定位需加"贴右缘则右对齐/翻转"的处理。像素级复核时优先验证。

**V1 — 三套"分段/标签"体系并存 [轻]**
Today 日历用 `seg-icons`(图标分段)、History/Accounts 用文字 `seg`、子导航用 `HorizontalTabs`。功能上区分(视图切换 vs 筛选 vs 子路由),但视觉语言接近,建议确认三者样式差异是否足以让用户区分"这是切视图还是切筛选"。

**空态/加载态覆盖**:主要页面空态齐全;Decision 的 saved/log 是明显缺口(S1)。加载态多依赖上层 store,单页少骨架屏,可接受。

---

## 四、Quick wins(低成本高收益)

1. 给 `.occ-micro-btn` 加 `--tap-min` 高度 + 增大点击热区(A1)。
2. `.help-tip-pop` 加 `max-width: min(300px, calc(100vw - 32px))` + 右缘翻转(A2)。
3. Decision 的 saved/log 补 `{:else}` 空态文案(S1)。
4. Decision/Stocks 的删除加一次 confirm,与 Settings 对齐(G5)。
5. 去掉桌面侧栏单项分组的组标题(G3)。
6. 移动底栏「记录」换「审查」,或补 FAB「记一笔」(G1)。

---

*说明:上半部分为静态代码走查。下方「修复与实测验证」为登录进 app 后的逐页实测结论。*

---

## 修复与实测验证(2026-07-14 补)

已登录进真实 app(移动视口 390px)逐页实测。核实后发现原审计有 3 条误报、实际修 4 条,均已在 app 内验证通过。

### 修复状态

| 项 | 结论 | 实测证据 |
|---|---|---|
| **G1** 移动底栏 | ✅ 已修并实测 | `nav.ts` 底栏 `review→history`;每页底栏均为 首页/账户/预测/**记录**/更多,审查进「更多」 |
| **A2** tooltip 溢出 | ✅ 已修并实测(3 轮迭代) | 今日+资产配置两处共 7 个 tooltip 全部 `right ≤ viewport`,视觉无裁切 |
| **S1** Decision 空态 | ✅ 已修并实测 | 「已保存方案」「决策日志」空态文案均显示;删除方案后空态正确复现 |
| **G5** 删除确认 | ✅ 已修并实测 | 建方案→删除:取消则保留、确认则删除;弹窗文案带方案名且正确 |
| A1 触摸目标 | ⏭️ 本已达标 | `@media (pointer: coarse)`(app.css)早已给 `.occ-micro-btn` 加 `min-height:44px`——原审计漏看 |
| G5-Stocks 删快照 | ⏭️ 本已达标 | `SnapshotPicker.svelte` 早有 `window.confirm`——原审计误判无确认 |
| G3 侧栏组标题 | ⏭️ 不成立 | 侧栏/More 根本未渲染 `group.label`(仅作 key/分隔线),无冗余可删 |

### A2 的教训(重点)

原「CSS 限宽」一版**不管用**——实地一点靠右的 ⓘ,气泡右侧仍被屏幕裁掉。限宽只防了"比屏幕宽",没解决"从靠右的图标向右展开导致越界"。最终方案经三轮:

1. CSS `max-width: min(300px, 100vw-32px)` —— 不够,定位没解决。
2. JS action + `requestAnimationFrame` 测量 —— rAF 在部分渲染时机不触发,不稳。
3. JS action **同步测量 + `left` 偏移**(新增 `lib/helpTipPosition.js`)—— 稳定生效。
   - 关键坑:实测这些绝对定位气泡对 `transform:translateX` **无反应**(`left` 才生效),故用 `left` 做横向回拉。
   - 挂在仅有的两处用法上:`TodayView` 的 `helpTip` snippet、`StocksSummaryKpis` 的 `kpiLabel`。

> 结论:纯 CSS 无法在无 JS 的前提下做到"靠边翻转",需 JS 同步测量并用 `left` 回拉。

### 第二轮:中优先级项处置

| 项 | 结论 | 说明 |
|---|---|---|
| **S3** reload 盖反馈 | ✅ 已修 | Settings 恢复/删除后不再立即 `reload`;结果文案加「即将刷新…」提示并延迟 1.6s 再刷新(`SettingsView.svelte`) |
| **D3** 资金去向密度 | ✅ 已修并实测 | Overview 该卡拆成三组带分隔线小标题(总额/可及构成/现金流,新增 `.kv-subhead`),12 行纯文字变为可扫读分组 |
| **V1** 三套分段体系 | ⏭️ 无需改 | 实测视觉已足够区分:HorizontalTabs=下划线页签、`seg`=填充药丸、`seg-icons`=图标切换 |
| **D1** 今日页密度 | ✅ 保守优化并实测 | 只减冗余、不藏功能:①删掉顶部与下方卡片完全重复的导语「今天先看:…」;②修掉「值得做」卡头两个动作按钮在移动端竖堆的问题(`.today-card-actions .icon-btn` 移动端 `width:100%`→`flex:1`,多按钮并排、单按钮仍撑满)。进一步的卡片折叠属产品取舍,未做 |
| **D2** 长 tooltip | ✅ 已改并实测 | 今日页两个最长的解释(STS「现在可放心花」、储蓄能力)从塞满整段的浮层 tooltip 改为点击「这个数怎么算?」展开的内联面板(新增 `.explain-toggle`/`.explain-panel`),移动端读整段更友好。较短的 tooltip 保持不变 |

`svelte-check` 0 errors;i18n 中英键位一致性通过。
