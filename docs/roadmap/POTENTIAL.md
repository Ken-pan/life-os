# 潜力研判（2026-07-17 晚 · 复利 / 闭环复核）

> **状态：当前研判。** 排序真源仍是 [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)；本文解释为什么。  
> **复利透镜（使用 × 开发）：** [`COMPOUND.md`](./COMPOUND.md)  
> **分卷细节：** [`apps/`](./apps/README.md)  
> 旧 2026-07-09 长篇证据已压缩到文末「历史附录」，**不得用于当前排期**。

## 结论（TL;DR）

```text
底座真源已大半闭环；下一刀切「信任收割 + 每日体感 + CI 可信」：

P0  PLAT.CI.0（远程 CI 证明绿；不得只以本地 gate 代替）
P1  FINC.PURCHASE.6.a closure QA
P1  KNOW.VAULT.0 → HOME.RECOG 残余（高精度补扫 / 自动精修）
P1  AIOS.STABLE.26
P2  HOME.MCP.13 → PLNR.UIUX.0 → PLNR.ATTACH.0 决策
```

**已从「未提交 P0」收割（2026-07-17 `5a2b7773`+后续）：**  
`HOME.RECOG.0` 版本史 · Knowledge 块编辑器 checkpoint · Health companion Xcode 工程入仓 · `appRegistry` / 样式基线提交。  
**Home 认亲主航道（RECOG.1–3）代码与验证已大幅落地**（安静扫描真机、matcher、证据 UI）；剩余是高精度补扫、扫后自动精修管线、入口打磨——见 [`apps/home.md`](./apps/home.md)。

## 复利怎么排（摘要）

详见 [`COMPOUND.md`](./COMPOUND.md)。本轮权重：

| 维度 | 权重 | 本轮含义 |
| --- | --- | --- |
| 交付完整性 / CI | 最高 | 远程红 = 所有复利打折 |
| 日用触点 | 高 | Vault watcher、Finance 审核收割、扫描安静可信 |
| 跨站放大 | 高 | MCP `where_is`、object_ref、life_events 消费端 |
| 防回归护栏 | 高 | AIOS 高速面几乎无自动测试 |
| 新 app / 大同步 | 低 | 无第二项目、无 Portal 日用价值则不做 |

## 当前 Top ROI

| 顺序 | 项 | 紧急度 | ROI | 投入 | 为什么现在 |
| --- | --- | --- | --- | --- | --- |
| 1 | **PLAT.CI.0** | P0 | 🔥 | <0.5–1d | 生成物/样式已入仓；远程仍见 `design-catalog` a11y（portal `btn-primary` 对比度）等红；integration-smoke 曾绿又抖。须 push 后全绿 |
| 2 | **FINC.PURCHASE.6.a closure** | P1 | 🔥 | 0.5–1d | UI/RPC/matcher 已完成；极少 QA 即可把「代码完成」变成可信发货；信任数字是平台锚点 |
| 3 | **KNOW.VAULT.0 watcher** | P1 | 🔥 | 0.5–1d | EDITOR.7 已入仓；curator/Obsidian 写回仍需重启才可见——直接打日用复利 |
| 4 | **HOME.RECOG 残余** | P1 | 🔥 | 0.5–1d | 安静模式/matcher/证据卡已验；缺高精度补扫区域引导 + 扫完自动 embed/match「15 分钟精修」 |
| 5 | **AIOS.STABLE.26** | P1 | ◆◆ | 1d | AIOS.1–25 铺开快，自动测试过薄；先护栏再扩 MCP 工具 |
| 6 | **HOME.MCP.13** | P2 | ◆◆ | 1–2d | `searchStorageItems()` + MCP 底座已齐；最短路径形成 Home→AIOS 真实消费 |

## 每个 App 未来 7 天只做一件事

| App | 首选目标 | 不做 / 后移 |
| --- | --- | --- |
| Planner | 用户同批签收 SCHED/CAPTURE；Agent 定向 UI 收口 | 附件先确认远程表/桶 |
| Fitness | maintenance | MEDIA.3 / SYNC.4 |
| Finance | **6.a closure QA 并收割** | 6b/6c 在 6.a 关闭前不开 |
| Music | paused / maintenance | PIPE.4 |
| Portal | maintenance | 不为凑九 app 扩卡 |
| Home | RECOG 残余 → MCP.13 | PROJ.7 / 完整项目云同步 |
| AIOS | **STABLE.26** | 暂停新增功能面 |
| KnowledgeOS | **VAULT.0** | SYNC/GRAPH 扩面后移；XREF 等 object_ref |
| HealthOS | HLT-5 用户真机 gate | Portal/Netlify/新连接器 |

## 不建议现在投入

- `HOME.PROJ.4` / `HOME.PROJ.7`：无第二真实项目；冲突模型贵。
- `KNOW.SYNC.1` Vault 原文上云：先 watcher。
- Portal 第七–九卡：本地优先 app 尚无每日 Portal 消费价值。
- Music / Fitness 普通增量、无边界全站 UI 重做：低于 closure 与护栏。
- 再造第 10 个产品 app：底座复利未吃满前是负分。

## 研判方法（常驻）

| 维度 | 权重 | 说明 |
| --- | --- | --- |
| 日用触点 | 高 | 每天打开的 app 优先 |
| 跨站放大 | 高 | Portal / `life_events` / MCP / `object_ref` |
| 实现就绪度 | 中 | 钩子、RPC、脚本是否已有 |
| 投入 | 中 | 单人 0.5–3d 可闭环优先 |
| CI / 真源完整 | 最高 | 远程漂移、红 CI、未提交生产 schema = 一票否决进功能 |

---

## 历史附录（2026-07-09 · 仅证据，勿排期）

当时已完成：FINC.CORE.0 route smoke · PLNR.CORE.2 · PORT.GROWTH.4b-M/H · MUSC.PIPE.5 · GYMS.EVENTS.1 / INTG.EVENTS.1b 等 —— 见 [`SHIPPED.md`](./SHIPPED.md)。

当时权重里「四生产站 E2E 未进 CI」部分已接线（`planner-e2e-desktop` / `finance-ia-routes` / `portal-qa-smoke` / `music-qa-rec-behavior`）；**当前 CI 瓶颈在 design-catalog a11y 与偶发 job 抖动**，不是「完全没 E2E」。

Finance STS 信任锚点（FINC.CORE.3）已于 2026-07-09 发货；今日 Finance 主刀是 **PURCHASE.6.a closure**，不是重做 STS。
