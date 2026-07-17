# 潜力研判（2026-07-17 夜 · auto-refine 后）

> **状态：当前研判。** 排序真源仍是 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)。  
> **复利：** [`COMPOUND.md`](./COMPOUND.md) · **用量：** [`USAGE_AUDIT.md`](./USAGE_AUDIT.md)  
> **分卷：** [`apps/`](./apps/README.md)

## 结论（TL;DR）

```text
认亲主航道与 auto-refine 已收割；下一刀切「CI + 信任 + 日用 watcher + 用量审计」：

P0  PLAT.CI.0
P1  FINC.PURCHASE.6.a closure → KNOW.VAULT.0 → PLAT.USAGE.0
P1  AIOS.STABLE.26
P2  HOME.MCP.13 → HOME.RECOG.1r 窄残余 → PLNR.* → object_ref
```

**刚收割（`4675dd06` / `bbfd7fb2`）：**  
Home `/plan` 认亲横幅 + Mac auto-refine 管线；Knowledge GFM 表格块 + 行内高亮。  
**用户 gate：** `HOME.RECOG.refine`（launchd 自装）· SCHED/CAPTURE · HLT-5。

## 复利权重（摘要）

| 维度 | 权重 | 本轮含义 |
| --- | --- | --- |
| 交付完整性 / CI | 最高 | 远程红 = 复利打折 |
| 日用触点 | 高 | Vault watcher、Finance closure |
| 决策复利 / 用量 | 高 | `PLAT.USAGE.0` 防死功能堆债 |
| 跨站放大 | 高 | MCP `where_is`、object_ref |
| Home 认亲窄残余 | 中 | 主航道已通；区域高精度不抢主线 |
| 新 app / 大同步 | 低 | 假复利 |

## 当前 Top ROI

| 顺序 | 项 | 紧急度 | ROI | 投入 | 为什么现在 |
| --- | --- | --- | --- | --- | --- |
| 1 | **PLAT.CI.0** | P0 | 🔥 | <0.5–1d | 远程全绿仍是开关 |
| 2 | **FINC.PURCHASE.6.a closure** | P1 | 🔥 | 0.5–1d | 信任锚点；极少 QA 可收割 |
| 3 | **KNOW.VAULT.0** | P1 | 🔥 | 0.5–1d | 编辑器已稳；watcher 打日用复利 |
| 4 | **PLAT.USAGE.0** | P1 | 🔥 | 0.5–1d | 决策复利；见 [`USAGE_AUDIT.md`](./USAGE_AUDIT.md) |
| 5 | **AIOS.STABLE.26** | P1 | ◆◆ | 1d | 高速面测试过薄 |
| 6 | **HOME.MCP.13** | P2 | ◆◆ | 1–2d | 跨 OS 快赢 |
| 7 | **HOME.RECOG.1r** | P2 | ◆ | 0.5–1d | 区域高精度 / 摘要签收；不阻塞主线 |

## 每个 App 未来 7 天只做一件事

| App | 首选目标 | 不做 / 后移 |
| --- | --- | --- |
| Planner | 用户签收 SCHED/CAPTURE；Agent 定向 UI | 附件先确认远程 |
| Fitness | maintenance | MEDIA.3 / SYNC.4 |
| Finance | **6.a closure** | 6b/6c |
| Music | paused | PIPE.4 |
| Portal | maintenance | 硬凑卡 |
| Home | 用户激活 refine；Agent：**MCP.13** 优先于 1r | PROJ.7 |
| AIOS | **STABLE.26** | 新功能面 |
| KnowledgeOS | **VAULT.0** | SYNC 上云 |
| HealthOS | HLT-5 真机 gate | Portal/Netlify |

## 不建议现在投入

- Home 完整项目云同步 / 多项目  
- Vault 原文上云（先 watcher）  
- 第三方 analytics 中台  
- 再造第 10 个产品 app  

## 历史附录

2026-07-09 长篇证据 → [`SHIPPED.md`](./SHIPPED.md)。勿用于当前排期。
