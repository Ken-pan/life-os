---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-17-roi-closure-audit
doc_role: execution-routing
priority_model: 2026-07-12-single-branch
---

# Agent 执行分线（2026-07-12 · 单分支版）

> **Hub 真源：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now / §Next
> **产品细节：** [`apps/`](./apps/README.md)
> **PaperOS：** 已迁出独立仓库 → [`apps/paperos.md`](./apps/paperos.md)
> **协作模型：** 单分支，无 worktree — 见 [`../../AGENTS.md`](../../AGENTS.md) §Git policy

## 协作模型（2026-07-12 起）

`master` 是唯一分支；不建 agent 专属 worktree/branch。**一 repo = 一 agent**：真正独立的项目（如 PaperOS）拆到独立仓库单独跑一个 agent，而不是在本 repo 开分支。若两个 agent 必须同时在 life-os 内工作，各自只认领一个 `apps/<app>` 目录，只 `git add` 自己的路径，不做仓库级破坏性操作（`git reset --hard` / `git checkout -- .` / `git clean` 等）。详见 [`AGENTS.md`](../../AGENTS.md) §Git policy。

## 当前焦点（§Now，对照 hub）

| Hub ID | 主题 | 状态 |
| --- | --- | --- |
| **PLAT.CI.0** | 恢复 master 交付可信度 | 🔴 本地修复已备好，待提交/push 后远程 CI 证明 |
| **HOME.RECOG.0** | 生产 schema ↔ git 真源闭环 | 🔴 migration 已生产 + 57 embeddings，但相关代码仍未提交 |
| **FINC.PURCHASE.6.a** | 支出审核 closure QA | 🟡 engine/RPC/matcher/UI 均完成；只剩 owner live、双 JWT RLS、视觉基线 |
| **KNOW.EDITOR.7** | 块编辑器 WIP 稳定化 | 🟡 20 文件大改；167 unit + check 绿，缺 browser smoke + checkpoint |

**已从 §Now 收割（见 SHIPPED）：** GYMS.SUB.5 · FINC.SYNC.1b · PLNR.CORE.4（2026-07-13）· AIOS.20–25 / GYMS.VOL.* / DS 07-14–17。

**近期代码事实（已改写优先级）：** master CI 连红 5 次；Home object recognition migration 已生产注册且有 57 embeddings，但代码未入版本史；Knowledge 编辑器有 +1284/−485 大 WIP；Health companion Xcode 工程仍有未提交部分。这些交付完整性风险优先于新功能。

**PLNR.SCHED.0 已验证：** `PLNR.SCHED.0.migrate` `cb11fbcc` · PWA harness `29f0c2ed` · build/check/unit ✅ · desktop + mobile E2E 全绿（2026-07-13）· `schedule-usability` standalone guard 4/4。
**PLNR.SCHED.0 仍开放：** 仅真机 iPhone Home Screen standalone 签收；归入 User Gate，不阻塞 Agent。

---

## 下一步（§Next，对照 hub）

| Hub ID | 主题 |
| --- | --- |
| **KNOW.VAULT.0** | 固定 Vault 外部文件 watcher（路径可配置后置） |
| **HOME.RECOG.1** | Quick Scan 安静模式 + 质量摘要 |
| **AIOS.STABLE.26** | chat/tool/cloud/Life OS 核心链路回归 |
| **HOME.MCP.13** | `where_is` 经 MCP 接 AIOS |
| **PLNR.UIUX.0** | 定向 UI 收口（非无边界全站重做） |
| **PLNR.ATTACH.0** | 现有 WIP 补远程表/桶+测试，或移除死入口 |

### User Gate（可并行，不占 Agent lane）

`PLNR.SCHED.10b.ios` · `PLNR.CAPTURE.0` · `HLT-5` 真机签名/HealthKit/iCloud/LAN。

PaperOS（`PAPR.*`）后续排期已迁出独立仓库，不在本文件追踪。

---

## 维护

Hub §Now ↔ 本文件对齐；每完成一项从上表移除并追加到 [`SHIPPED.md`](./SHIPPED.md)。PaperOS 相关生命周期/设备 gate 细节不在本仓库维护，见独立仓库 [`apps/paperos.md`](./apps/paperos.md)。

**相关：** [`apps/planner.md`](./apps/planner.md) · [`../qa/planner-schedule-uiux-audit.md`](../qa/planner-schedule-uiux-audit.md)
