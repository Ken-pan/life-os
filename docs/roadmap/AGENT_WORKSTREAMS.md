---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-12-single-branch
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
| **PLNR.SCHED.0** | 日程视图 debug + 可用性闭环 | 🟡 BLOCKED — standalone shell guard / 真机 iPhone 签收 / sign-off 未完成 |
| **GYMS.SUB.5** | 替代动作完整训练流 | ✅ Engineering + Product gate PASS |
| **FINC.PURCHASE.6** | 支出审核（商品明细 + 后续处理） | 🟡 Discovery CONDITIONAL PASS · `FINC.PURCHASE.6.a` BLOCKED |
| **PLNR.CORE.4** / **FINC.SYNC.1b** | 快赢 — 计数对齐 / 扩展 sync 状态 | ⏳ ~0.5d 各 |
| **PAPR.\*** | PaperOS 设备 Shell | 迁出 → 独立仓库 `/Users/kenpan/「Projects」/paperos`，见 [`apps/paperos.md`](./apps/paperos.md) |

**PLNR.SCHED.0 已验证：** `PLNR.SCHED.0.migrate` `cb11fbcc` · PWA harness `29f0c2ed` · build/check/unit ✅ · desktop E2E 72/8 · PWA mobile sanity ✅。
**PLNR.SCHED.0 仍 BLOCKED：** standalone shell guard · `qa:mobile-scroll` · isolated `schedule-usability` fixture · 真机 iPhone standalone · sign-off。
**暂停 / 后移：** `PLNR.UIUX.0`（须 `PLNR.SCHED.0` 关单后）· `FINC.PURCHASE.6.a`（须 association/decision migration 先行）。

---

## 下一步（§Next，对照 hub）

| Hub ID | 主题 |
| --- | --- |
| **PLNR.UIUX.0** | Planner 全站 UI/UX 走查 |
| **PLNR.ATTACH.0** | Task / Project 附件底座 |
| **HOME.PROJ.7** | Home 多项目 localStorage 切换 |

PaperOS（`PAPR.*`）后续排期已迁出独立仓库，不在本文件追踪。

---

## 维护

Hub §Now ↔ 本文件对齐；每完成一项从上表移除并追加到 [`SHIPPED.md`](./SHIPPED.md)。PaperOS 相关生命周期/设备 gate 细节不在本仓库维护，见独立仓库 [`apps/paperos.md`](./apps/paperos.md)。

**相关：** [`apps/planner.md`](./apps/planner.md) · [`../qa/planner-schedule-uiux-audit.md`](../qa/planner-schedule-uiux-audit.md)
