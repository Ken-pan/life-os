# Scheduled Jobs — 本机定时任务

跑在开发机上的 launchd 定时任务。plist 和 wrapper 都在仓库外(`~/Library/LaunchAgents/`、
`~/.local/bin/`),所以这里登记它们的存在、装法和排障入口 —— 换机重装照此重建。

跑在本机而不是 CI,是因为这些任务要用 Keychain 里的 Supabase 个人访问令牌
(`security find-generic-password -s "Supabase CLI"`)。放 CI 就得把一个能读写整个
Supabase 项目的令牌存成仓库 secret,不划算。

| Label                              | 频率       | 干什么                                |
| ---------------------------------- | ---------- | ------------------------------------- |
| `com.kenpan.finance-dedupe-mirrors` | 每天 03:30 | 排除重复扣款行（两种形态）+ 防重哨兵 |

---

## com.kenpan.finance-dedupe-mirrors

排除会让花销被双计的重复行。**两种形态，两个引擎** —— 它们不是一回事，混淆过一次：

**形态 1：跨源镜像**（`engine/aggregateMirror.ts` → `detectAggregateMirrors`）
Rocket Money 这类聚合源把卡账源已有的扣款用规范化商户名（`Amazon Purchase` vs 卡账描述符
`AMAZON MKTPL*942YV4SB3`）再写一遍。同日 + 同额，**不同账户**。历史上排除过 25 行
（2026-01 ~ 05）。这必须是事后批扫而非写入时去重：镜像检测要求同日同额的真实卡账孪生行
已经存在，而聚合源经常比卡账源先落库。

**形态 2：重复写入**（`engine/reimportDuplicates.ts` → `detectReimportDuplicates`）
一次同步/导入运行与更早的一次重叠，把已经写过的行又写一遍。同日 + 同额 + 同商户，
**同一账户**。2026-07-04 就是这样：同步跑了两次，隔 14 分钟，重了 6 行 / $285.95。

> ⚠ 形态 2 抓不到时**不要**用形态 1 的检测器去试 —— 它会报「clean」，因为库里跨源镜像
> 一对都没有。它正确地回答了另一个问题。

**为什么不能按「同日同额同商户」粗暴去重：** 那不是重复的充分条件。同一天刷 5 次地铁
（5 × $2.90）、洗 2 次衣服（2 × $2.00）在账单原文里就是多行真实扣款。判据是**写入时刻**：
一次运行看到几笔，就是几笔（`真实多重度 = 某一次运行贡献的最大行数`）。这也扛得住部分捕获
——早的运行只滚到 1 笔、晚的滚到 2 笔时，答案是 2 而不是 1。

**检测逻辑不在脚本里：** 两个都是 finance-core 里的纯引擎，有单测覆盖；
`apps/finance/scripts/dedupe-aggregate-mirrors.mjs` 只是 IO 壳。订单富化有歧义时脚本会跳过
并标注 `⚠ keeps enrichment (ambiguous — review)`，不盲写。

**定时任务只软排除，不删行**（写 `exclude_reason`，可回滚）。它无人值守跑在半夜，不该对
账本做不可逆的事。要彻底删，先导出存档再按 id 删。

### 防重哨兵

写入侧有两道防线，脚本每次跑都会检查它们还在不在：

| 路径      | 防线                                                                    |
| --------- | ----------------------------------------------------------------------- |
| 扩展同步  | `platform_id` + 部分唯一索引 `transactions_user_capture_platform_uidx`   |
| CSV 导入  | `transaction_fingerprint` + `source_file_hash` 挡重复文件（RPC 层 raise） |

**两道都会静默失效**，这是重点。`platform_id` 是从页面 DOM 扒的 —— Rocket Money 一改
markup 就可能扒不到，而那个索引是**部分索引**（`WHERE platform_id IS NOT NULL`），条件不满足
就直接不生效，没有任何报错。2026-07-04 的重复正是这么进来的（叠加当时 ON CONFLICT 与部分
索引对不上、报 42P10 不去重，已由 `3e8fcc15` 于 07-06 修复）。

所以哨兵判据是「**两道防线都没有**」：`GUARD_EPOCH`（2026-07-07，即所有新行都带保护的第一天）
之后写入、却既无 `platform_id` 又无 `transaction_fingerprint` 的行。锚定固定纪元而非滚动窗口，
是为了不让它每晚重报已经了结的历史行 —— 每晚误报的哨兵等于没有哨兵。

### 文件

| 路径                                                        | 作用                        |
| ----------------------------------------------------------- | --------------------------- |
| `~/Library/LaunchAgents/com.kenpan.finance-dedupe-mirrors.plist` | 调度（每天 03:30）        |
| `~/.local/bin/finance-dedupe-mirrors.sh`                    | wrapper，带 `--apply` 调脚本 |
| `~/.local/log/finance-dedupe-mirrors.log`                   | stdout（每次一个时间戳段）  |
| `~/.local/log/finance-dedupe-mirrors.error.log`             | stderr                      |

### 装 / 卸

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kenpan.finance-dedupe-mirrors.plist
launchctl bootout   gui/$(id -u)/com.kenpan.finance-dedupe-mirrors
```

### 排障

```bash
# 状态 + 上次退出码
launchctl print gui/$(id -u)/com.kenpan.finance-dedupe-mirrors | grep -E "state|runs|last exit"

# 不等到 03:30，立刻跑一次
launchctl kickstart -w gui/$(id -u)/com.kenpan.finance-dedupe-mirrors

# 只看会改什么，不写库
cd apps/finance && npm run dedupe:mirrors
```

干净时日志只有一行 `no duplicate rows found. Ledger is clean. ✓`。哨兵报警会多出一行 `⚠`。

**Mac 睡着/关机会漏跑吗：** 会跳过该次触发，但 launchd 会在唤醒后补跑。而且新镜像本来就是
本机浏览器扩展抓进来的 —— Mac 不开就没有新数据写入，不会积压。

**认证失败**（`Missing Supabase access token`）：Keychain 里的 `Supabase CLI` 项没了，
跑 `supabase login` 重新登录即可。
