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
`PLNR.ATTACH.0` · `HOME.MCP.13` · `AIOS.STABLE.26` · CI SHA 并发 · Home group-merge。  
**暂停交接：** [`../qa/agent-handoff-2026-07-17-roi.md`](../qa/agent-handoff-2026-07-17-roi.md)。

## 复利权重（摘要）

| 维度 | 权重 | 本轮含义 |
| --- | --- | --- |
| 交付完整性 / CI | 最高 | 远程红 = 复利打折 |
| 日用触点 | 高 | Finance closure、Vault 真机验 |
| 决策复利 / 用量 | 高 | 已有首报；节奏化见 USAGE.0b |
| 跨站放大 | 高 | MCP `where_is`、object_ref |
| Home 认亲窄残余 | 中 | 主航道已通；区域高精度不抢主线 |
| 新 app / 大同步 | 低 | 假复利 |

## 当前 Top ROI

| 顺序 | 项 | 紧急度 | ROI | 投入 | 为什么现在 |
| --- | --- | --- | --- | --- | --- |
| 1 | **PLAT.CI.0** | P0 | 🔥 | <0.5d | 缺五品牌 snapshot PNG（290）；非 cancel |
| 2 | **FINC.PURCHASE.6.a closure** | P1 | 🔥 | 0.5d | 信任锚点；过滤拆分已做，剩 owner QA |
| 3 | **HOME.RECOG.1r** | P2 | ◆ | 0.5–1d | 区域高精度 / 摘要签收 |
| 4 | **PLNR.UIUX.0** | P2 | ◆ | 1d | 生产收口按需（ATTACH.0 已收） |
| 5 | **KNOW.XREF.5** | P2 | ◆◆ | 1–2d | object_ref 试点加深 |

## 每个 App 未来 7 天只做一件事

| App | 首选目标 | 不做 / 后移 |
| --- | --- | --- |
| Planner | 用户签收 SCHED/CAPTURE；Agent 定向 UI | 附件先确认远程 |
| Fitness | maintenance | MEDIA.3 / SYNC.4 |
| Finance | **6.a closure**（真机） | 6b/6c |
| Music | paused | PIPE.4 |
| Portal | maintenance | 硬凑卡 |
| Home | 用户激活 refine + MCP 配进 AIOS；Agent：**RECOG.1r** | PROJ.7 |
| AIOS | 用 where_is（配 MCP URL） | 堆新功能面 |
| KnowledgeOS | 原生 rebuild 验 watcher | SYNC 上云 |
| HealthOS | HLT-5 真机 gate | Portal/Netlify |

## 不建议现在投入

新 OS / 大同步 / Portal 硬凑本地优先 app 卡 / Home 多项目（无第二真实项目）。
