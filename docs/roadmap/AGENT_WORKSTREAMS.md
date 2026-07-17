---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-17-compound-docs
doc_role: execution-routing
priority_model: 2026-07-12-single-branch
---

# Agent 执行分线（2026-07-12 · 单分支版）

> **Hub 真源：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now / §Next  
> **复利透镜：** [`COMPOUND.md`](./COMPOUND.md) · **ROI：** [`POTENTIAL.md`](./POTENTIAL.md)  
> **产品细节：** [`apps/`](./apps/README.md)  
> **PaperOS：** 已迁出 → [`apps/paperos.md`](./apps/paperos.md)  
> **协作模型：** 单分支，无 worktree — 见 [`../../AGENTS.md`](../../AGENTS.md) §Git policy

## 协作模型（2026-07-12 起）

`master` 是唯一分支；不建 agent 专属 worktree/branch。**一 repo = 一 agent**：真正独立的项目（如 PaperOS）拆到独立仓库单独跑。若两个 agent 必须同时在 life-os 内工作，各自只认领一个 `apps/<app>` 目录，只 `git add` 自己的路径，不做仓库级破坏性操作。详见 [`AGENTS.md`](../../AGENTS.md) §Git policy。

## 当前焦点（§Now，对照 hub）

| Hub ID | 主题 | 状态 |
| --- | --- | --- |
| **PLAT.CI.0** | 恢复 master 交付可信度 | 🟡 生成物/样式已入仓；远程仍见 design-catalog a11y（portal 对比度）等红 —— 须远程全绿 |
| **FINC.PURCHASE.6.a** | 支出审核 closure QA | 🟡 engine/RPC/matcher/UI 完成；剩 owner live、双 JWT RLS、视觉基线 |
| **KNOW.VAULT.0** | Vault 外部文件 watcher | ⏳ EDITOR.7 已 checkpoint；下一刀日用复利 |
| **HOME.RECOG.1r** | 认亲残余（高精度补扫 + 自动精修） | 🟡 RECOG.0–3 主航道已验；残余见 home app 文档 |

**已收割（勿再当未提交 P0）：** `HOME.RECOG.0` · `KNOW.EDITOR.7` checkpoint · Health companion Xcode 入仓（`5a2b7773`+后续）· GYMS.SUB.5 · FINC.SYNC.1b · PLNR.CORE.4。

**PLNR.SCHED.0：** 仅剩真机 iPhone Home Screen standalone 签收 → User Gate，不阻塞 Agent。

---

## 下一步（§Next，对照 hub）

| Hub ID | 主题 |
| --- | --- |
| **PLAT.USAGE.0** | 第一方用量 / 功能利用率审计（决策复利）→ [`USAGE_AUDIT.md`](./USAGE_AUDIT.md) |
| **AIOS.STABLE.26** | chat/tool/cloud/Life OS 核心链路回归 |
| **HOME.MCP.13** | `where_is` 经 MCP 接 AIOS |
| **PLNR.UIUX.0** | 定向 UI 收口 |
| **PLNR.ATTACH.0** | 附件 WIP：补远程或拆死入口 |
| **KNOW.XREF.5** / `object_ref` | 跨 OS 引用契约加深 |

### User Gate（可并行，不占 Agent lane）

`PLNR.SCHED.10b.ios` · `PLNR.CAPTURE.0` · `HLT-5` 真机签名/HealthKit/iCloud/LAN。

PaperOS（`PAPR.*`）不在本文件追踪。

---

## 维护

Hub §Now ↔ 本文件对齐；完成项移入 [`SHIPPED.md`](./SHIPPED.md)。入 Now 前先过 [`COMPOUND.md`](./COMPOUND.md) 三问。
