# KnowledgeOS AI 自动化任务审核文档

> 审计日期：2026-07-16。范围：`~/「Projects」/local-ai/services/knowledge/curator.py`（策展流水线）+
> `vault_server.py`（RAG 检索服务）+ 3 个 launchd 定时任务 + 网关路由。
> **这些代码物理上不在 life-os 仓库内**（KnowledgeOS 前端只是消费方），但会**自动读写用户 Vault 里的
> Markdown 文件**，因此单独立档供审核，不混进产品 README。

## 为什么单独审核

KnowledgeOS 与 Life OS 其余六站的关键区别：其他 app 的"自动化"止于前端状态计算，不落盘用户内容；
KnowledgeOS 有一整套**后台 LLM 流水线**会在用户不在场时自动**新建、覆盖、删除** Vault 里的
Markdown 文件，且部分操作（主题合并）不可逆。审核目的是让用户清楚每个任务到底做了什么、什么时候做、
出错会怎样，而不是只看到"AI 检索问答"这一层用户可见的功能。

## 一、任务清单总表

| 任务 | 触发方式与频率 | 读 | 写 | 用到的模型 | 幂等性 |
| --- | --- | --- | --- | --- | --- |
| L2 每日摘要 | launchd `curator.plist`，每天 23:30 | `Work Log/*-digest-*.md`（回看2天） | `Work/Digests/daily-summary-YYYY-MM-DD.md` | `llm-fast`，超14000字自动升 `llm-quality` | ✅ 源文本 sha256 未变则跳过 |
| 摘要质量评测（LLM-as-judge） | 每次生成摘要后自动跑；也可手动 `curator.py eval` | 当天原始来源 + 生成的摘要 | 就地改写同一摘要文件 frontmatter（`eval-coverage`/`eval-faithfulness`） | `llm-quality` | ✅ 字段覆盖 |
| L3 主题折叠 | 同 `nightly`，23:30 紧接摘要之后 | 最近N天 `daily-summary-*.md` + 现有全部 `Topics/*.md` | `Topics/<slug>.md`（新建/替换当日时间线条目，可能删除清空的主题笔记） | `llm-quality` | ✅ 每日指纹比对 |
| 派生索引刷新（看板+人物笔记） | `nightly` 末尾 + `weekly`→`garden` | 全部 `Topics/*.md` | `Topics/_未决看板.md`（覆盖）+ `People/<slug>.md`（覆盖，**会删除不再出现的人物笔记**） | 无 LLM，纯确定性代码 | ✅ 全量覆盖重算 |
| L4a 周汇总 | launchd `curator-weekly.plist`，每周日 23:50 | 当前 ISO 周内 `daily-summary-*.md` | `Rollups/weekly-YYYY-Www.md` | `llm-quality` | ✅ 窗口指纹比对 |
| **L4b 园丁巡检（去重合并）** | 同 `weekly`，23:50 | 全部主题笔记 slug/标题 | **删除**被合并主题原文件，仅留精简墓碑于 `Topics/_merged/`；刷新看板/人物笔记；macOS 通知停滞提醒 | `llm-quality` 判定近义主题 | ⚠️ **不可逆**，无 dry-run |
| L4c 月度汇总 | launchd `curator-monthly.plist`，每月1号 00:20 | 当月周报 `weekly-*.md` | `Rollups/monthly-YYYY-MM.md` | `llm-quality` | ✅ 月键指纹比对 |
| Vault 索引扫描 | `vault_server.py` 常驻后台线程，每 90 秒轮询 | 两个 vault 下全部 `*.md`，按 mtime+size 判增量 | 只写本地 SQLite 索引，**不写任何 Markdown** | `llm-tiny`（chunk 上下文化） | ✅ 未变文件跳过 |
| RAG 检索/问答 | 被动，前端按需请求 `/search` `/ask` | 索引里的 chunk | 不写 Vault，仅返回文本 | 检索：embeddings+reranker；生成：`llm-fast`（前端可指定） | 无副作用 |

## 二、任务详细说明

### 1. L2 每日摘要
把采集器（MSFT2Obsidian）追加到 Work Log 的原始 Teams/Outlook/日历条目，先做确定性噪音过滤，
再交 LLM 提炼成结构化 JSON（一句话/待办/已解决/决策/相关人/相关项目），写成
`Work/Digests/daily-summary-YYYY-MM-DD.md`。原子写入（先写 `.tmp` 再 rename），提炼失败则跳过、
不写半截文件。**明确只读原始 Work Log、只写独立 Digests 目录，未发现任何修改/删除原始或手写笔记的代码路径。**

### 2. 摘要质量评测（LLM-as-judge）
代码注释记录了加这个机制的原因：**2026-07-13 曾出现过静默产出整篇空摘要、数日无人察觉的真实事故**。
每次生成新摘要后自动用裁判模型打覆盖率/忠实度两项分，就地写回同一文件 frontmatter；低于阈值触发
macOS 通知。**实测发现的盲区**：手动运行 `curator.py eval` 不会记入 `curator.log`（该文件只捕获
launchd 触发的运行输出），近 3 晚 nightly 日志里完全没有"评分"字样，无法从日志确认自动评测在
launchd 运行内是否稳定执行——已确认的分数（`daily-summary-2026-07-15.md` 里 `eval-date: 2026-07-16`）
时间戳明显是次日手动补跑产生的，而非当晚自动完成。

### 3. L3 主题折叠
把每日摘要中值得长期追踪的事项折叠进跨天"主题线"笔记。Prompt 核心规则是"优先复用已有主题 slug，
不新建近义主题"，并由 LLM 判定 status（open/resolved/monitoring）。按来源日期"替换式"写入
（先清该日旧条目再插入新的），同日重跑不会重复追加；若某主题时间线被清空则删除该文件，但仅限
`source: curator` 标记的文件，不碰手写笔记。**风险**：主题归并、状态判定完全由 LLM 一次性决定，
且没有人工复核环节——错误判断（如把未解决的事标成 resolved）会被写入 Vault 并在后续折叠时被
"复用"进一步固化，不易察觉。代码注释记录过一次真实 bug（提示词常量命名冲突导致被静默覆盖），
说明这类脚本级错误此前确实发生过。

### 4. 派生索引刷新（看板 + 人物笔记）
纯确定性代码，无 LLM 参与。从主题笔记反推生成 `Topics/_未决看板.md`（停滞>14天/进行中/关注中/
近期已解决四分区，全量覆盖）和逐人 `People/<slug>.md`（列出其涉及主题双链）。**会自动删除不再
出现在任何主题里的人物笔记**——限定 `generated-by: local-ai/curator` 标记防止误删手写内容，
但用户应知晓这是"看不见的自动增删"：某人几周没被提及，其笔记会被删除，之后再出现会重新生成。
实测 3 晚人物笔记数从 19→27→34 篇持续增长。

### 5. L4a 周汇总
把一个 ISO 周内所有每日摘要综合成周报，聚焦跨天主线。`max_tokens=4000` 防止长输出被截断导致
JSON 解析失败。`--force` 可强制重生成，否则按周窗口指纹跳过未变周。

### 6. L4b 园丁巡检（去重合并）—— **本次审计中风险最高的一步**
LLM 找出确实是同一件事的近义主题，给出 `{canonical, duplicates, reason}`；代码把被合并主题的
时间线/项目/人物并入 canonical 后，**立即删除被合并主题的原始 md 文件**，仅在 `Topics/_merged/`
留一份精简"墓碑"（只有标题和"已并入 [[canonical]]"一句话，**丢失原主题完整时间线正文的独立备份**）。
`force_merge` 默认为 `True`，**无 dry-run 模式、无二次确认、合并即执行**，唯一可恢复途径是 git
历史或 Obsidian 自身版本历史，而不是脚本本身提供的回滚机制。同一轮巡检还会刷新看板/人物笔记，
并对停滞 >14 天的 open/monitoring 主题发一次 macOS 通知（每周巡检最多发一次，防刷屏）。

### 7. L4c 月度汇总
由当月周报综合成月报，逻辑与周汇总一致，共用同一份指纹状态文件（周键 `YYYY-Www` 与月键 `YYYY-MM`
格式不冲突，互不覆盖）。

### 8. Vault 索引服务（`vault_server.py`）
启动即起后台线程，每 90 秒增量扫描两个 vault（主 Vault + Agent 记忆库），按标题分节做标题感知切块，
超长小节按段落切且带重叠；多块笔记额外用常驻小模型为每个 chunk 生成上下文化定位描述后再入嵌入/BM25。
存 SQLite（`files`/`chunks`/`chunks_fts` 三表）。**索引服务本身只写 SQLite，不写任何 Vault 内的
Markdown，纯只读消费。** `POST /reindex` 可全量重建；curator 不会主动调用它，全靠 90 秒增量扫描器
自然收纳新写入的摘要文件。

### 9. RAG 检索/问答（`/search` `/ask`）
BM25（SQLite FTS5）+ 向量检索（Qwen3-Embedding-8B，Matryoshka 截断 1024 维）各取 top24，RRF 融合
（k=60）后取前24，再经 Qwen3-Reranker-8B 精排；重排失败会打印 `[rerank-fallback]` 日志退回 RRF 序，
不会整体报错。`/ask` 把检索到的资料拼成带编号文本交给 LLM（默认 `llm-fast`，前端可传 `model` 字段
覆盖，**目前无白名单校验**），要求"只依据资料回答、每条论断标注引用、资料不足直说没有、绝不编造"。
异常时会把 `str(e)` 直接返回给调用方（HTTP 503），可能带出内部错误细节但不涉及笔记正文；
`knowledge.log` 只见 uvicorn access log，未见笔记正文或查询内容被写入日志。

## 三、本地化确认（是否会有隐私数据出机器）

- `services/gateway` 目录本身是空的，实际网关是仓库根 `config/llama-swap.yaml` 定义的 `llama-swap`
  进程（`127.0.0.1:18888`）；vault 检索服务以反向代理形式挂载在 `devtools` 组下，通过
  `POST /upstream/vault/search` 等路径消费。
- `llama-swap.yaml` 里注册的全部模型（`llm-fast`/`llm-quality`/`llm-tiny`/embeddings/reranker/
  图像/语音/视觉）命令行均为本地 `mlx_lm.server` 或 `llama-server` 调用本机磁盘权重文件，
  **未发现任何外部 API Key、外部 Base URL 或云端 endpoint 配置**。
- 结论：curator 的全部 LLM 调用 + vault_server 的检索/生成链路，**100% 本地执行**，笔记内容
  不会离开本机。

## 四、风险点小结（按严重程度排序）

1. **园丁巡检的主题合并是不可逆的自动删除操作**（每周日 23:50）：LLM 单次决策后立即删除被合并
   主题原文件，只留精简墓碑，无独立完整备份；无 dry-run、无二次确认，`force_merge` 默认开启。
   这是全流程里对已生成内容破坏性最强的一步，**建议优先关注/考虑加开关**。
2. **主题状态判定（open/resolved/monitoring）由 LLM 单次决定且会被后续复用固化**：误判不易被
   发现，因为看板和停滞提醒都依赖该字段，错误会"隐藏"在正常运作的表象之下。
3. **手动执行的子命令不会计入 `curator.log`**：只有 launchd 触发的运行才被重定向进日志文件，
   人工干预（如手动补跑 `eval`）缺乏审计轨迹，容易误判某功能"从未运行过"。
4. **摘要质量评测的自动执行情况未经近期日志验证**：该功能的存在动机是此前发生过真实的"静默产出
   空摘要数日无人察觉"事故，但近 3 晚 nightly 日志完全没有评分记录，目前唯一的评分证据来自次日
   手动补跑，无法确认 launchd 自动运行内评测是否稳定生效。
5. **人物笔记会被自动删除**：设计上合理（限定 `generated-by` 标记防误删手写内容），但用户应
   知晓这是无提示的自动增删行为。
6. **`/ask` 端点 `model` 参数无白名单校验**：目前网关内全是本地模型无泄露风险，但若未来网关
   新增外部代理模型，这里没有防护会自动继承该风险。
7. **无全局 dry-run / 预览模式**：整个 curator.py 没有"只预览不写入"的运行方式，安全阀只有
   幂等指纹跳过 + 对原始来源/手写笔记的只读边界（审计中未发现违反该边界的代码路径）。

## 五、实际运行证据

launchd 调度（读自 3 个 plist）：

| plist | 调度时间 |
| --- | --- |
| `space.kenos.local-ai.curator.plist` | 每天 23:30（daily：run+topics+索引刷新） |
| `space.kenos.local-ai.curator-weekly.plist` | 每周日 23:50（rollup+garden） |
| `space.kenos.local-ai.curator-monthly.plist` | 每月1号 00:20（monthly rollup） |

`~/Library/Logs/LocalAI/curator.log` 近 3 晚 nightly 记录摘要：

```
[2026-07-13 23:30] 07-12 无内容跳过，07-13 写入 daily-summary
                    → 主题折叠 5 条主题线，更新 7 个主题笔记 → 看板 + 19 篇人物笔记
[2026-07-14 23:30] 07-13 来源有变化重写 + 07-14 写入
                    → 折叠 07-13:4 条 07-14:5 条，更新 8 个主题笔记 → 看板 + 27 篇人物笔记
[2026-07-15 23:30] 07-14 未变跳过 + 07-15 写入
                    → 07-14 折叠跳过，07-15 折叠 5 条主题线，更新 5 个主题笔记 → 看板 + 34 篇人物笔记
```

补充实测：
- 当前 Vault 实际文件数：`Digests` 9 篇、`Topics` 11 篇、`Rollups` 4 篇、`People` 35 篇、
  原始 `Work Log` 147 篇，规模与日志增长趋势一致。
- `Work/Topics/_未决看板.md` 实际存在，格式与代码生成逻辑一致。
- `knowledge.log`（vault_server 运行日志）仅见 uvicorn access log 与一次 `/search` 调用，
  无报错、无 rerank-fallback 记录，末尾正常 `Shutting down`（非崩溃退出）。
- `curator-weekly.plist` / `curator-monthly.plist` 近期日志暂无记录，尚未确认是否已实际触发过。

## 六、待用户决策项

- 是否给「园丁巡检合并」加开关或 dry-run 预览（当前默认开启且不可逆）。
- 是否需要把手动子命令运行也纳入 `curator.log`，补齐审计轨迹。
- 是否需要对 `weekly`/`monthly` 两个 launchd 任务做一次实际触发确认（目前只有间接的日志缺失，
  不代表任务本身有问题，但值得手动验证一次）。
