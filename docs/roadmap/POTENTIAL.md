# 潜力研判（2026-07-17 夜 · STABLE.26 后）

> **状态：当前研判。** 排序真源仍是 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。  
> **复利：** [`COMPOUND.md`](./COMPOUND.md) · **用量：** [`USAGE_AUDIT.md`](./USAGE_AUDIT.md)  
> **分卷：** [`apps/`](./apps/README.md)

## 结论（TL;DR）

```text
能力刀已收很多；当前唯一 P0 是 catalog visual 基线缺口：

P0  PLAT.CI.0 — 补五品牌 snapshot PNG（见 handoff）
P1  FINC.PURCHASE.6.a closure（用户 gate 重）
P2  HOME.RECOG.1r（区域补扫/观感）→ PLNR.UIUX → object_ref
```

**刚收割：**  
`PLNR.ATTACH.0` · `HOME.MCP.13` · `AIOS.STABLE.26` · CI SHA 并发 · Home group-merge · **`KNOW.XREF.5` wikilink 小闭环** · **`PLNR.MCP.0` Planner MCP 面**。  
**暂停交接：** [`../qa/agent-handoff-2026-07-17-roi.md`](../qa/agent-handoff-2026-07-17-roi.md)。

## 复利权重（摘要）

| 维度 | 权重 | 本轮含义 |
| --- | --- | --- |
| 交付完整性 / CI | 最高 | 远程红 = 复利打折 |
| 日用触点 | 高 | Finance closure、Vault 真机验 |
| 决策复利 / 用量 | 高 | 已有首报；节奏化见 USAGE.0b |
| 跨站放大 | 高 | MCP 面已成小舰队（Home `where_is` + Planner 任务 CRUD）→ AIOS 推理内核逐步坐实；下一刀是**抽共享 MCP 鉴权**（2 消费者已够）而非再单造 |
| Home 认亲窄残余 | 中 | 主航道已通；区域高精度不抢主线 |
| 新 app / 大同步 | 低 | 假复利 |

## 当前 Top ROI

| 顺序 | 项 | 紧急度 | ROI | 投入 | 为什么现在 |
| --- | --- | --- | --- | --- | --- |
| 1 | **PLAT.CI.0** | P0 | 🔥 | <0.5d | 缺五品牌 snapshot PNG（290）；非 cancel |
| 2 | **FINC.PURCHASE.6.a closure** | P1 | 🔥 | 0.5d | 信任锚点；过滤拆分已做，剩 owner QA |
| 3 | **HOME.RECOG.1r** | P2 | ◆ | 0.5–1d | 区域高精度 / 摘要签收 |
| 4 | **PLNR.UIUX.0** | P2 | ◆ | 1d | 生产收口按需（ATTACH.0 已收） |
| 5 | **PLAT.MCP.0** 抽共享 MCP 鉴权 | P2 | ◆◆ | 0.5d | Home/Planner 两个 MCP 函数已重复 `jwtFromRequest`+JWT 客户端+`getUser`；抽进 `@life-os/mcp-server`/`sync`，Finance/Fitness MCP 近零成本（开发复利，2 消费者已达提取门槛）|
| 6 | **KNOW.XREF.5** `object_ref` | P2 | ◆◆ | 1–2d | wikilink 小闭环已发；稳定对象引用契约仍未起（北极星，待第二真实消费者再上大契约）|

## 复利复核续（2026-07-17 夜续 · 以复利透镜再扫一遍）

本会话落地 `KNOW.XREF.5` wikilink 小闭环 + `PLNR.MCP.0` 后，从三层复利看**还需要推进什么**：

- **使用侧（跨 OS 消费）：** MCP 从单点（Home `where_is`）变成小舰队（+ Planner 任务 CRUD）。AIOS 作为推理内核的价值第一次「能查家里东西 + 能管当天任务」。**下一刀不是再单造一个 MCP**，而是 **`PLAT.MCP.0` 抽共享鉴权**（见 Top ROI #5）——之后 Finance「查结余/本月支出」、Fitness「记一组/看 readiness」的 MCP 都近零成本。**真源仍是每日触点**：Finance closure、Vault watcher 真机验（用户 gate）未过前，跨站消费的「源头可信度」就有缺口。
- **决策侧（用量）：** `PLAT.USAGE.0` 首报已出、`PLAT.USAGE.0b` 节奏化在飞（并行会话）。复利判据要求**审计产生决策**——首报后应至少冻结/删一项低利用表面，或把一项日用缺口提进 Now；否则审计沦为仪表盘。AIOS/Knowledge/Health 本机探针仍缺。
- **开发侧（成本下弯）：** CI 绿是复利开关（hub 称 `PLAT.CI.0` 已 run 29618672879 全绿，本 doc TL;DR 的 P0 表述已过期，以 hub 为准）。新的可提取点＝上面的共享 MCP 鉴权。
- **北极星（object_ref）：** wikilink 是**字符串标题**引用、非稳定对象引用；`object_ref` + 通用时间线仍未起。按复利判据「无第二真实消费者别上大契约」，继续**等**——但 Planner↔Knowledge↔AIOS 的引用需求已在积累，够两个真实消费者时即可开工。

**一句话：** 当前最高复利的下一步是 **`PLAT.MCP.0`（抽共享 MCP 鉴权，把 AIOS 推理内核的边际成本压到近零）**，其次是让 `PLAT.USAGE.0b` **真的砍掉/提拔一项**（决策复利落地），信任侧的 Finance/Vault 真机 gate 仍是源头。

## 每个 App 未来 7 天只做一件事

| App | 首选目标 | 不做 / 后移 |
| --- | --- | --- |
| Planner | MCP 配进 AIOS 验真实读写（PLNR.MCP.0 用户 gate）；用户签收 SCHED/CAPTURE | 附件先确认远程 |
| Fitness | maintenance | MEDIA.3 / SYNC.4 |
| Finance | **6.a closure**（真机） | 6b/6c |
| Music | paused | PIPE.4 |
| Portal | maintenance | 硬凑卡 |
| Home | 用户激活 refine + MCP 配进 AIOS；Agent：**RECOG.1r** | PROJ.7 |
| AIOS | 配 Home + Planner 两个 MCP URL，当跨 OS 推理内核用 | 堆新功能面 |
| KnowledgeOS | 原生 rebuild 验 watcher | SYNC 上云 |
| HealthOS | HLT-5 真机 gate | Portal/Netlify |

## 不建议现在投入

新 OS / 大同步 / Portal 硬凑本地优先 app 卡 / Home 多项目（无第二真实项目）。
