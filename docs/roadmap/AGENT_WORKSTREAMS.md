---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-17-recog-refine
doc_role: execution-routing
priority_model: 2026-07-12-single-branch
---

# Agent 执行分线（2026-07-12 · 单分支版）

> **Hub 真源：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now / §Next  
> **复利透镜：** [`COMPOUND.md`](./COMPOUND.md) · **用量：** [`USAGE_AUDIT.md`](./USAGE_AUDIT.md) · **ROI：** [`POTENTIAL.md`](./POTENTIAL.md)  
> **产品细节：** [`apps/`](./apps/README.md)  
> **PaperOS：** 已迁出 → [`apps/paperos.md`](./apps/paperos.md)  
> **协作模型：** 单分支 — [`../../AGENTS.md`](../../AGENTS.md) §Git policy

## 协作模型（2026-07-12 起）

`master` 是唯一分支；不建 agent 专属 worktree/branch。**一 repo = 一 agent**。若两 agent 同仓，各自只认领一个 `apps/<app>`，只 `git add` 自己的路径。详见 [`AGENTS.md`](../../AGENTS.md)。

## 当前焦点（§Now，对照 hub）

| Hub ID | 主题 | 状态 |
| --- | --- | --- |
| **PLAT.CI.0** | 恢复 master 交付可信度 | 🟡 生成物已入仓；远程仍可能因 design-catalog a11y 等红 |
| **FINC.PURCHASE.6.a** | 支出审核 closure QA | 🟡 剩 owner live、双 JWT RLS、视觉基线 |
| **KNOW.VAULT.0** | Vault 外部文件 watcher | ⏳ 编辑器已扩表格/高亮；下一刀日用复利 |
| **PLAT.USAGE.0** | 用量 / 功能利用率审计 | ⏳ 决策复利；见 [`USAGE_AUDIT.md`](./USAGE_AUDIT.md) |

**已收割：** `HOME.RECOG.0`–3 主航道 · **/plan 横幅 + auto-refine**（`4675dd06`）· `KNOW.EDITOR.7` + 表格/高亮 · Health companion 入仓。

## 下一步（§Next）

| Hub ID | 主题 |
| --- | --- |
| **HOME.RECOG.1r** | 窄残余：区域高精度补扫 · 摘要观感 · 可选 group-merge |
| **AIOS.STABLE.26** | 核心链路回归护栏 |
| **HOME.MCP.13** | `where_is` → AIOS |
| **PLNR.UIUX.0** / **PLNR.ATTACH.0** | 定向 UI · 附件决策 |
| **KNOW.XREF.5** / `object_ref` | 跨 OS 引用加深 |

### User Gate（不占 Agent lane）

`PLNR.SCHED.10b.ios` · `PLNR.CAPTURE.0` · `HLT-5` · **`HOME.RECOG.refine`**（用户 `launchctl` 激活 auto-refine）。

## 维护

Hub §Now ↔ 本文件对齐；完成项 → [`SHIPPED.md`](./SHIPPED.md)。入 Now 过 [`COMPOUND.md`](./COMPOUND.md) 四问。
