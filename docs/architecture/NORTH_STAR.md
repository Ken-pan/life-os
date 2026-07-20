---
title: Life OS 北极星愿景
owner: kenpan
last_verified: 2026-07-18-endstate
doc_role: vision / north-star
review_cadence: quarterly
---

# Life OS 北极星愿景

> **这份文档回答一件事：** 如果 Life OS 做到极致，它是什么样子？以及——我们离那儿还有多远？
>
> 这是**愿景与方向**，不是排期。现状与优先级的真源永远是 [`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) 与 [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md)；本文若与它们冲突，以那两份为准。
>
> 配套的可视化讲解页（图表沿用 `@life-os/platform-web` 图表族）：见本文末「延伸」。

## 一句话

Life OS 最理想的样子，不是十几个各管各的 App，而是**一套围绕你的数据、状态和目标运行的个人操作系统**。每个 OS 只回答一个清晰的问题——多了会乱，少了会散。

## 为什么（要解决的问题）

今天，即使每个 app 都很好用，一个决定仍然散落在到处：床的调研在笔记里、收据在账本里、尺寸在户型图里、搬运任务在待办里，而它们**彼此不认识**。于是同一件事被记很多遍，三个月后你想不起当初为什么买它，AI 也不知道不同系统说的是同一个东西。

理想状态下，这件事只被记一次，十个 OS 从各自的角度看它。

## 十个 OS，每个只管一件事

| OS | 它回答的问题 |
|---|---|
| **Portal** | 现在最重要的是什么？ |
| **Planner** | 下一步该做什么？ |
| **Knowledge** | 我知道什么？ |
| **Status**（Health + Focus） | 我现在适合做什么？ |
| **Fitness** | 身体该怎么练？ |
| **Finance** | 我承担得起什么？ |
| **Home** | 空间该怎么服务生活？ |
| **Music** | 现在该是什么氛围？ |
| **Paper** | 怎么安静地读和想？ |
| **AIOS** | 系统怎么理解并帮我做？ |

**判据：** 只有当一个领域有独立的数据模型、独立的工作流、高频使用、和一个明确的核心问题，才值得单独成一个 OS。Wardrobe、Travel、Pets、People 先做成模块，成熟了再独立。

## 统一底座：一件事只记一次

所有 OS 站在同一个底座上。底座才是真正的产品。

1. **统一对象图谱** —— 家具、笔记、交易、任务指向同一个实体。记录一次，到处生效。
2. **通用时间线** —— 任何重要变化都进同一条线，可回溯每个决定的来龙去脉。
3. **本地优先** —— 笔记、embedding、图谱、推理优先在设备上；云端只做同步与授权计算。
4. **全局搜索** —— 一个搜索框，不用先想「它在 Planner 还是 Knowledge」。
5. **AIOS 运行时** —— 智能内核，不是另一个聊天页：默认安静地整理、关联、检查，只在真要决定时才打扰你。

## 理想的一天（叙事版）

> 早上，Status 读到你睡眠不足、静息心率偏高，于是 Planner 把高强度训练推迟、深度工作挪到下午，Portal 只说一句「今天恢复度偏低，已排好更轻的一天」。会议录音进 Knowledge，自动转录、提取决定、关联项目，Planner 顺手建好行动项。下午你回到手上的项目，上次的编辑位置、分支、未解决问题一并回来。训练时 Fitness 按恢复分调好组数，Music 切到晚间散步。睡前 Portal 只留三样：今日完成、未解决、明天第一步。然后系统安静下来。

你不再花时间管理信息、找上下文、维护系统。系统持续理解你的生活，但**不替你夺走决定权**。

## 和现在的距离

诚实地讲：**管子已经通了，只是各 app 还各过各的。**

**好消息（已在生产跑 / 2026-07-18）：** 五个生产站共享 SSO、`life_events`、`core_*`。**MCP 舰队** Planner / Finance / Fitness / Home 生产 4/4，AIOS 登录自动接入。**wikilink** Planner + Finance → KnowledgeOS（`KnowledgeNoteLinks` + `knowledgeos://`）。Portal Finance **角标**已部署。AIOS 读 `core_*`、经 events 写 Planner；Home 认亲与 `where_is` 已闭环；Knowledge 块编辑器 + Vault 本地真源。

**真正的距离（更深一层）：** 今天的连接是**联邦制**——每个 app 守着自己的数据，靠事件 / MCP / wikilink 互相「打个招呼」。愿景要的是**联合制**——同一件事只存一次，十个 OS 从不同角度看同一个对象。

| 底座能力 | 现状 | 差距 |
|---|---|---|
| 统一身份（SSO） | ✅ 生产 | 基本到位 |
| 共享读模型（`core_*`） | ✅ 各站在读今日快照 | 是快照，不是同一份对象 |
| 事件总线（`life_events`） | 🟡 通了 | 事件种类少、消费端少 |
| AIOS 工具面（MCP） | ✅ 四站舰队 + 登录自动 | 日用验收仍待 Ken；工具面按 USAGE 扩 |
| 跨 OS 引用（wikilink） | 🟡 Planner+Finance→Knowledge | 非稳定 `object_ref`；按痛点升级 |
| 本地优先 | 🟡 AIOS / KnowledgeOS / HealthOS 已是 | 尚未成为全系统默认 |
| 全局搜索 | 🔴 各搜各的 | 未跨库 |
| **统一对象图谱 + 通用时间线** | 🔴 几乎白纸（wikilink 试点） | **愿景的关键前沿** |

取舍透镜 → [`../roadmap/COMPOUND.md`](../roadmap/COMPOUND.md)。各 OS **Done when** → [`../roadmap/apps/`](../roadmap/apps/README.md) 分卷 §终局。

**各 app 今天真实的成色：**

- **生产在跑：** Portal、Planner、Fitness、Finance、Music。
- **原生 Mac app、还没进 Portal：** AIOS（推理内核 + MCP 舰队）、KnowledgeOS（Vault + RAG，正文未上云）、HealthOS（HLT-0–4；HLT-5 真机 gate）。
- **实验、双层数据：** Home 可编辑项目仍本地真源；扫描/照片/事件已上云；`where_is` MCP ✅；DEVICE.12 待 HA。
- **已迁出独立仓库：** Paper（`~/「Projects」/paperos`；本仓只留 `/api/paper/*`）。

## 下一步

仓库内九个产品 app + 独立仓库 PaperOS 已经覆盖北极星列出的十个 OS。方向不是再做第 11 个 App，而是**把已经在跑的这些，并进同一张对象图谱和同一条时间线**——**按痛点推进，不按愿景开大坑。**

关键岔路不变：严格边界（app 不互引、各守各表）要不要为「统一对象」松动、以何种方式（对象/时间线服务，而非合并业务表）。排期真源仍是 [`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。

**战略序（与 hub 同步）：**

1. **使用验收（Ken）** — AIOS 三问 + Portal 角标；否则 MCP/角标不算日用复利。
2. **真机 gate（Ken）** — SCHED / CAPTURE / HLT-5。
3. **日用真源加厚（Agent）** — Knowledge `VAULT.0` rebuild 验收；USAGE 本机探针。
4. **条件刀** — 装 HA → `HOME.DEVICE.12`；wikilink 不够用 → `object_ref`；HLT-5 后 → Status 最小 capacity 契约（不上传明细）。
5. **不做** — 第 11 app；无第二项目 Home 多项目云同步；Vault 抢先上云；无消费者 `INTG.EVENTS.2`。

## 产品原则（防止方向漂移）

1. 一个 OS 只回答一个问题。
2. AI 默认安静工作，只在要决定时打扰。
3. 一个事实只有一个真源，别处都是引用/视图。
4. 所有自动化都可解释、可撤销。
5. 状态优先于计划——Status 持续影响工作量、提醒、UI 密度。
6. OS 不是越多越好。

## 延伸

- 现状与优先级：[`LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)
- 体系架构快照：[`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md)
- 跨站集成矩阵：[`../roadmap/apps/README.md`](../roadmap/apps/README.md) §跨站集成矩阵
- 契约白名单 / 事件总线：[`contracts.md`](./contracts.md) · [`events-rfc.md`](./events-rfc.md)
- 可视化讲解页（Artifact，图表用 `@life-os` 图表族）：`https://claude.ai/code/artifact/b6873f24-90bc-4131-a979-1877688a7e0e`
