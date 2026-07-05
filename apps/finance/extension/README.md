# Finance OS Sync（Chrome 扩展）

从 Robinhood / Rocket Money / Fidelity 的已登录页面抓取数据，自动同步到 Finance OS。

> **后端说明（2026-07）**：Finance OS 与 Fitness OS 已合并为 Supabase 项目 **Life OS**（`iueozzuctstwvzbcxcyh`）。
> 扩展仍只与 Finance OS **网页**通信，不直连 Supabase；云端写入由页面内的 `ExtensionSyncBridge` → `public` schema 完成。
> 登录态使用 `life_os_auth`（与主应用一致）。

## 工作方式

```
券商/记账页面                    扩展                        Finance OS 页面
┌────────────────┐   DOM 抓取   ┌──────────────┐  postMessage  ┌─────────────────┐
│ Robinhood      │ ───────────▶ │ background   │ ◀───────────▶ │ ExtensionSync-  │
│ Rocket Money   │  (content    │ 队列 + 快照  │   双向 bridge │ Bridge 组件      │
│ Fidelity       │   scripts)   │ storage.local│               │ → Supabase      │
└────────────────┘              └──────────────┘               └─────────────────┘
```

- **抓取**：打开三个平台的页面后 content script 自动运行，等数据渲染稳定后抓取，
  进入扩展本地队列（同源同类只保留最新一份）。不需要任何 API key，不发任何网络请求。
- **抓取计划（双向）**：打开 Finance OS 时，bridge 会向 app 请求账本快照
  （账户 / 最近 4000 笔交易键 / 订阅 / 持仓摘要），存入 `fos_app_snapshot`。
  下次从 Rocket Money 等机构抓取时，扩展会**跳过已在 app 的数据**：
  余额一致的不入队、订阅已对账的不入队、交易按 date+商户+金额 multiset 预过滤，
  滚动收集默认参考 app 最新交易日期和扩展水位线定快速停止点，避免每次扫完整个历史。
- **同步**：打开 Finance OS（`localhost` 任意端口或 Netlify 部署），页面里的
  `ExtensionSyncBridge` 收到 captures 后写入 Supabase，并回 ACK 清除队列。
  已处理的 capture id 记录在 localStorage，刷新/多标签不会重复导入。
- **查看状态**：点扩展图标可以看到「抓取计划 / 待同步 / 最近同步」。

## 抓取内容

| 平台 | 页面 | 数据 | 写入 |
|------|------|------|------|
| Robinhood | 投资首页（Virtualized 侧栏列表） | ticker/股数/单价或市值/当日%；缺失详情时触发后台批量打开个股页 | 持仓快照（当日覆盖）+ 券商账户余额 |
| Robinhood | 个股页 `/stocks/TICKER`（用户浏览或后台静默 tab） | 均价、市值、今日/累计盈亏（$ 与 %）、股数 → `fos_rh_position_details` | 详情齐全后合并入队同步到 Finance OS |
| Rocket Money | Dashboard | 分组余额 + **展开后逐账户**（全精度，含机构名） | 唯一类型匹配的账户余额 |
| Rocket Money | Net Worth | 逐账户余额（账户名 + 机构 + 缩写金额 $57.7k） | 名称/机构匹配的账户余额（近似值放宽容差） |
| Rocket Money | Recurring | 订阅/账单（名称/频率/金额/下次扣款） | 与 cashFlows 对账：月付金额有变则更新，未收录项 toast 提示 |
| Rocket Money | Transactions | 交易行（日期/商户/类别/金额/pending/平台ID） | 新交易（跳过 pending 与重复） |
| Fidelity | Portfolio Summary | 左侧账户列表（账户名/账号/全精度余额/分组） | retirement/hsa/brokerage 匹配的账户余额 |
| Fidelity | Positions | 持仓 + 账户总值（尽力解析） | 持仓快照 + 账户余额 |

## 安装

1. Chrome 打开 `chrome://extensions`，右上角开启「开发者模式」。
2. 「加载已解压的扩展程序」→ 选择本目录（`extension/`）。
3. 如果你的 Finance OS 部署在自定义域名，把它加进 `manifest.json` 里
   bridge content script 的 `matches`，然后在扩展页点「重新加载」。

## 日常使用

### 方式一：主动抓取（Rocket Money，推荐）

点扩展图标 → 先看「抓取计划」是否已更新（需至少打开过一次 Finance OS）→
「抓取 Rocket Money（余额 + 订阅 + 交易）」，扩展会自动：

1. 读取 Finance OS 快照，跳过已在 app 的余额 / 订阅 / 交易；
2. 打开（或切到）Rocket Money 标签页；
3. 跳到 Dashboard 抓**仍需更新**的分组余额；
4. 跳到 Net Worth 抓**余额有变**的逐账户行；
5. 跳到 Recurring 抓**尚未对账**的订阅/账单；
6. 跳到 Transactions 页自动滚动——默认滚到 app 最新交易日前 3 天或扩展水位线前 3 天，
   或列表到底为止；
7. popup 里实时显示「X 需抓 / Y 已跳过」，完成后打开 Finance OS 即写入。

安全上限：单次最多收集 600 笔 / 滚动 90 步；首次没有快照/水位线时会一直滚到上限或到底。
如抓取超过 90 秒或 30 秒无进展，popup 会显示「下载 debug log」。日志为 **Agent 友好 JSON**（schema `finance-os-sync-debug/v2`）：

- **`diagnosis`**：自动摘要问题、错误码、建议下一步（Agent 应先看这里）
- **`errors`**：全部 warn/error（含 stack、code、phase）
- **`timeline`**：完整抓取时间线（seq + elapsedMs + url）
- **`phases`**：按阶段分组的尝试记录
- **`meta.extension.version`**：扩展版本号
- **`performance`**：阶段耗时、probe/route 超时、交易滚动统计
- **`sync`**：队列 / DLQ / in-flight / Robinhood enrich 状态
- **`environment.tabs`**：当前打开的 Rocket Money / Finance OS 标签页

文件名形如 `finance-os-sync-debug-v0.1.9-<timestamp>.json`。

### 方式二：被动抓取

正常逛一遍 Robinhood 投资页 / Rocket Money 各页 / Fidelity Positions，
抓取全自动（DevTools console 有 `[FOS]` 日志），打开 Finance OS 后右下角弹同步结果 toast。

**Robinhood 持仓详情（均价 / 今日盈亏 / 累计盈亏）**：列表页只有涨跌幅 %，不含 $ 盈亏。
扩展会在列表抓取后自动在后台依次打开缺失详情的 `/stocks/TICKER` 页（最多 30 只/批，缓存 24h），
补齐后再把完整持仓写入队列。也可在 popup 点「补齐 Robinhood 持仓详情」手动重跑。
需保持 Chrome 登录 Robinhood；后台 tab 为静默打开，完成后自动关闭。

### 方式三：手动补齐 Robinhood 详情

扩展 popup →「补齐 Robinhood 持仓详情（均价/盈亏）」——基于队列里最新的 Robinhood 持仓快照，
对缓存过期或缺失的 ticker 重新后台打开个股页。完成后会自动打开 Finance OS 并投递同步。

## 安全边界

### 防误写 / 误覆盖

- 余额更新只在「唯一匹配到账户」时执行；`balanceManual` 锁定的账户永不覆盖。
- 名称匹配要求**整词包含**（词边界对齐），"Rent" 不会误配进 "Parent Lending"；
  多重命中时用机构名收窄，还不唯一就跳过并提示。
- 同一个 capture 里两行映射到同一账户（两张同名信用卡）：先到先得，第二行跳过并提示。
- **时序保护**：capture 可能在队列里滞留数天，若账户在抓取时刻之后更新过
  （手动改过 / 更新的数据已先写入），旧 capture 不允许倒灌覆盖。
  账户 `updatedAt` 记「抓取时刻」而非写入时刻，保证跨 capture 比较语义正确。
- Fidelity 的 holdings totalValue 在 All accounts 视图是 401k+HSA+券商聚合值，
  **永不**写给单个账户——Fidelity 余额只走 accounts capture（逐账户全精度）。
- RocketMoney 的 Investments 分组是多账户聚合值，不会盲目写给某一个账户。
- Net Worth 页余额只有 3 位有效数字（$57.7k）：标记为近似值，现有精确余额落在
  舍入误差内（±0.6%）就不改写，避免精确值被粗糙值来回抖动。
- Recurring 对账**不自动新建** cashFlow（避免与手动合并项撞车）：
  只更新「名称匹配 + 频率一致 + 金额有变」的月付项，其余在 toast 里列出让你决定。

### 防重复

- 交易去重按「日期+商户+金额」**计数**（multiset）：同日同商户同金额的两笔真交易
  （platformId 不同）都能入账；重复同步时已有几笔就跳过几笔，不会多插。
  无 platformId 的同 key 行分不清真假重复，同一 capture 内只收第一条（保守）。
- 交易导入跳过 pending（settle 后金额/商户可能变化，下次同步自然补上）。
- 持仓快照 id 按「来源+日期」稳定生成，同一天多次同步覆盖而非堆积。
- 每个 capture 有唯一 id，app 处理后记入 localStorage（幂等）；
  **多标签页**同开 financeOS 时用 Web Locks 串行消费 + 每次处理前重读处理记录，
  同一 capture 恰好写入一次。bridge 重复投递（hello/storage 变化/回前台）按 id 去重。
- 队列去重键 = 来源+类型+页面路径：Dashboard 分组余额和 Net Worth 逐账户余额互补共存，
  同页面的新抓取替换旧的（只保留最新）。

### 时间正确性

- 交易日期支持 "7/2"、"7/2/25"、"7/2/2025" 三种格式；无年份时按「未来即去年」推断
  （只对 12 个月内可靠，更久远的行 RocketMoney 会带年份显示）。
- **交易水位线只由 complete 爬取推进**：即「从最新一直无空洞收集到 watermark/底部」的
  主动爬取。被动抓取只含可见的十几行，若用它推进会把没滚到的旧日期永久跳过；
  因行数/步数上限中断的爬取同理不推进（宁可下次重滚，不留数据空洞）。

## 健壮性设计（对齐 2026 社区最佳实践）

- **DOM 静默检测**：抓取时机由 MutationObserver quiescence 决定（500ms 无变更才评估，
  2s 硬上限兜底），不是盲目轮询——SPA 水合完成前不会误抓，静态页面零延迟。
- **二次确认 + 上限**：结果连续两次一致才提交；实时行情页（价格一直在跳）
  连续 5 次不一致就接受最新值，保证盘中也能抓到。
- **虚拟滚动事件驱动**：滚动前先挂 MutationObserver，滚动后通常等 2 帧 + 90ms 即继续；
  若无新增行会额外短等复查，320ms 兜底，比固定 sleep 快且不漏行。
- **性能记忆**：主动抓取会把阶段耗时、probe timeout、route timeout 与交易滚动统计写入
  `fos_crawl_perf`，debug log 会一起导出，供下一轮 Agent 优化使用。
- **消息安全**：postMessage 双向都校验 `source === window && origin === location.origin`，
  payload 逐字段类型验证后才入库。
- **MV3 SW 生命周期**：所有状态存 `chrome.storage.local`（不依赖 SW 内存），
  消息处理器同步注册并 `return true`；长任务（爬取）跑在 content script 里，
  不受 SW 30 秒回收影响。
- **观察器清理**：所有 MutationObserver 在 `pagehide` 时断开，防内存泄漏。

## RocketMoney 页面结构备忘（2026-07 实测）

- 技术栈：React + styled-components（`sc-*` 混淆类名**不可依赖**），
  稳定锚点是 `data-testid` 与 `role` 属性。
- Transactions 表：`role="grid"` + 虚拟滚动（一次只渲染约 17 行可见行，
  行高 60.5px），行 `data-testid="transaction-table-row"`，
  行 `aria-label` 尾部括号内是 base64 交易 ID（`Transaction:数字ID`）。
- 分页：**一页约 170 行**（虚拟列表总高约 10500px），滚到底后出现
  「Load More」按钮加载下一批——爬虫到底时会自动点它继续。
- 名称 cell 内含视觉隐藏的 "Statement Description" + 原始账单描述；
  若改版移除，退回「日期后文本最长的非金额 cell」啟发式（已测试）。
- Dashboard Accounts 卡片：h6 "Accounts"，分组行 `div[role="button"]`
  含名称/金额两个 label；Net Cash 为派生值跳过。
- Net Worth 页：分组标题行（"Investments" + "% of assets"）后跟账户表，
  账户行 = `img[alt="机构 logo"]` + 两个 `p`（账户名/机构）+ 缩写余额 label。
- Recurring 页：三个 `data-testid="subscription-section-card"` 分区，
  行 `data-testid="table-row"`，label 序为 名称/频率/••账户/到期/金额；
  平台 ID 在行内 kebab 菜单的 `aria-controls="recurring-list-<base64>"`。
- Fidelity Summary 页（Angular + web components）：账户列表锚点
  `.acct-selector__acct-wrapper`（名 `.acct-selector__acct-name`、
  余额 `.acct-selector__acct-balance`），分组名在外层 `<section aria-label>`。
- 页面级滚动容器 id 为 `scrollable-content`（虚拟容器找不到时的兜底滚动目标）。
- 无公开 API；社区方案（bmoney 等）都走手动 CSV 导出，
  确认 DOM 抓取是目前唯一的自动化路径。

## 页面改版了怎么办

选择器都集中在 `content/*.js` 顶部注释标明的位置。把改版后的页面
「另存为 → 网页（单个文件).mhtml」，用它比对更新选择器即可
（Robinhood/RocketMoney 的选择器就是这样从 2026-07 的实测页面提取的）。
