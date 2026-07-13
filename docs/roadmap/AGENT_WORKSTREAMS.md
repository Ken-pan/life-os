---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-11-p-sched-0
doc_role: execution-routing
priority_model: 2026-07-11-lifecycle-correction
---

# Agent 执行分线（2026-07-11 · 生命周期修正版）

> **Hub 真源：** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) §Now / §Next
> **产品细节：** [`apps/`](./apps/README.md)
> **PaperOS 生命周期：** [`../qa/paperos-device-lifecycle-discovery.md`](../qa/paperos-device-lifecycle-discovery.md) · [`../qa/paperos-device-lifecycle-gate.md`](../qa/paperos-device-lifecycle-gate.md)

## TL;DR — 现在怎么分 Agent？

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Ken     Slice 1.1 点验 + SYS-0 电源/Folio/suspend 日志（60–90min）     │
├──────────────────────────────────────────────────────────────────────────┤
│  Fable   独占 1 worktree · P-SCHED-0 **BLOCKED** · 待 standalone + 真机签收 · 不建 F-P6 worktree │
│  Codex   Track1 FT-P5 │ Track2 VERIFY → SYS-0 → SYS-1/2                  │
│  Cursor  docs 已同步 · 下一步 standalone 注入/fixture · 等 SYS-0 后再碰生命周期 C++ │
│  Antigravity  F-P6 baseline · 不负责物理睡眠判定                          │
│  Copilot  lint / PR summary only                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

**2026-07-11 关键修正：** PaperOS 是 **设备主 Shell**，不是普通前台 App。新增 **`P-MOVE-SYS-*`** 系统生命周期主线（VERIFY 之后、**P-MOVE-6 之前**）。Slice 2 可做 IA，真机合并不绕过 **SYS-1** 安全退出。

**启动模式定案：** **Mode A — Xochitl 默认** · 架构 **A 默认、B-ready**（`SYS-3` Beta「解锁后自动进入 PaperOS」，默认 Off；见 discovery §产品假设）。

| 修正项        | 内容                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------ |
| **Line 归属** | **Line B** = Shell + UI + **SYS** · **Line E** = VERIFY + 5 + 6（数据平面）— VERIFY **只属于 E** |
| **Fable**     | patch 等待期可 **只读** 审 F-P6 baseline；**不得** 开第二个实现 worktree                         |
| **P-MOVE-6**  | **暂缓** 至 `SYS-2` 完成；suspend 下 Qt Timer 不继续                                             |
| **Ken**       | 设备任务 = 明确矩阵（见 §Ken 设备窗口）                                                          |

---

## 0. 当前并行分配一览（2026-07-11 · P-SCHED-0 交接）

**Canonical 实现：** branch `fable/p-sched-0` · worktree `/Users/kenpan/「Projects」/life-os/.claude/worktrees/p-sched-0`（Cursor/Fable 实现冲突已解除；master working tree **不是** P-SCHED-0 实现位置）。

| 平台             | 当前任务                                    | Hub ID            | 投入       | 阻塞 / 交接              |
| ---------------- | ------------------------------------------- | ----------------- | ---------- | ------------------------ |
| **Ken**          | Slice 1.1 点验 + **SYS-0** 生命周期日志采集 | P-MOVE-UI · SYS-0 | 60–90m     | 与 VERIFY 同一设备窗口   |
| **Claude Fable** | **P-SCHED-0 最终 sign-off**（暂停中）       | P-SCHED-0         | 1 worktree | standalone guard · 真机 iPhone · **BLOCKED** |
| **Codex T1**     | FT-P5 主实现                                | FT-P5             | 2–3d       | 与 Fable 并行            |
| **Codex T2**     | P-MOVE-VERIFY → **P-MOVE-SYS-0**            | VERIFY · SYS-0    | 0.5–1d     | Ken 设备                 |
| **Codex**        | P-MOVE-5 staging（数据层，非日用发布）      | P-MOVE-5          | 1d         | VERIFY 后                |
| **Cursor**       | standalone 状态注入 / isolated fixture 稳定 | SCH-10 harness    | <半天      | SCH-0 ✅ · PWA harness ✅ · SYS-0 前勿改 C++ |
| **Antigravity**  | F-P6 History baseline                       | F-P6              | S          | 无物理 suspend           |
| **Copilot**      | PR summary / lint                           | —                 | 碎片       | —                        |

**P-SCHED-0 已验证：** SCH-0 `cb11fbcc` · PWA harness `29f0c2ed` · build/check/unit ✅ · desktop E2E 72/8 · PWA mobile sanity ✅。

**P-SCHED-0 仍 BLOCKED：** standalone shell guard · `qa:mobile-scroll` · isolated `schedule-usability` fixture · 真机 iPhone standalone · Fable sign-off。

**暂停 / 后移：** `P-MOVE-6` 实现 · Slice 2 **真机合并**（IA 可先做）· 用 Antigravity 判设备睡眠 · **F-P6a** · **P-UIUX-0**（须 P-SCHED-0 关单后）。

---

## PaperOS lifecycle correction（2026-07-11）

### Critical finding

PaperOS 正在接管 Home/Today、导航、笔记、Gallery、同步与 System Drawer，接近 **主 Shell**。当前 Roadmap 有 UI、VERIFY、写路径、定时 sync，但**未定义**：

- 冷启动后谁先运行 · 如何无 Mac 进入/退出
- 电源键 / Folio · suspend 与唤醒 · sync 在睡眠期间是否继续
- 崩溃与 boot 失败恢复 · 安全返回 xochitl + **rm-sync**

这是 **发布阻塞级** 系统生命周期缺口，不是 UI 增强。

### 推荐状态机（实现前以 SYS-0 真机为准）

```text
NATIVE → ENTERING_PAPEROS → PAPEROS_ACTIVE ⇄ PAPEROS_AMBIENT
              ↓ suspend
         SUSPENDED → RESUMING → (补偿 sync)
              ↓ crash-loop
         RECOVERY → xochitl
```

> **常显 Dashboard ≠ 后台仍在运行**（e-ink 可保留最后一帧）。

### Line 归属（DRI 唯一）

```text
Line B — PaperOS Shell
  P-MOVE-UI · P-MOVE-SYS-0/1/2/3 · P-MOVE-SYS-GATE
  Owner: Codex 设备集成 + Cursor QML + Ken 设备 gate
  Fable: Slice 2 IA 语义 · SYS-3 ≤30min review · 不拥有设备集成

Line E — Paper 数据平面
  P-MOVE-VERIFY · P-MOVE-5 · P-MOVE-6
  Owner: Codex
```

**`P-MOVE-VERIFY` 只属于 Line E**（从 Line B 移除，避免双 DRI）。

### 依赖图

```text
Slice 1.1 device PASS
        ├── Slice 2 IA（Fable 可规划，不真机合并）
        ▼
P-MOVE-VERIFY（Line E）
        ├── P-MOVE-5 staging
        └── P-MOVE-SYS-0 discovery
              ▼
        P-MOVE-SYS-1 enter / exit / recovery
              ├── Slice 2 device implementation（不得绕过 SYS-1）
              ▼
        P-MOVE-SYS-2 sleep / wake / idle
              ▼
        P-MOVE-SYS-3 settings UI
              ▼
        P-MOVE-6 Sync now + active timers + wake reconciliation
              ▼
        P-MOVE-SYS-GATE
```

### P-MOVE-SYS 任务摘要

| ID           | 主题                    | Owner                      | 估时               | 交付                                                                                   |
| ------------ | ----------------------- | -------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| **SYS-0**    | 生命周期发现            | Codex + Ken                | 0.5d + 45–60m 设备 | [`paperos-device-lifecycle-discovery.md`](../qa/paperos-device-lifecycle-discovery.md) |
| **SYS-1**    | enter / exit / recovery | Codex · Cursor 菜单        | 1–1.5d             | `paperos-enter/exit/recover` · systemd · crash-loop fallback                           |
| **SYS-2**    | sleep / wake / idle     | Codex                      | 1–2d               | pre-suspend flush · wake refresh · `lastSyncAt` 补偿                                   |
| **SYS-3**    | Settings UI             | Cursor · Fable ≤30m review | 0.5–1d             | auto-sleep · wake-to · sync-on-wake                                                    |
| **SYS-GATE** | 真机可靠性              | Ken + Codex                | —                  | [`paperos-device-lifecycle-gate.md`](../qa/paperos-device-lifecycle-gate.md)           |

**SYS-1 System 菜单最低项：** Sleep · Restart PaperOS · Return to reMarkable · Restart device · Shut down（危险操作确认）。

**P-MOVE-6 约束：** 应用内 timer **不能**假定 system suspend 期间仍运行；须 **活跃期定时 + 唤醒按 `lastSyncAt` 补偿**；RTC 定时唤醒 = 实验，不进 MVP。

---

## Ken 设备窗口（明确矩阵）

| 顺序 | 任务                                           | 验收                        |
| ---- | ---------------------------------------------- | --------------------------- |
| 1    | Slice 1.1 点验（toolbar · Gallery · recovery） | 通过/失败记入 pro-move 分卷 |
| 2    | VERIFY：观察 sync footer / cache 更新          | fetch 200                   |
| 3    | SYS-0：电源键 · Folio · suspend journal        | discovery.md 填表           |
| 4    | （SYS-GATE 阶段）LC-01–LC-15                   | lifecycle-gate.md           |

---

## 1. 五平台分层

| 梯队 | 平台         | Life OS 角色                            | 默认           |
| ---- | ------------ | --------------------------------------- | -------------- |
| T1   | Claude Fable | P-SCHED-0 · F-P6 · Slice 2 **IA**       | usage credits  |
| T1   | Codex        | FT-P5 · VERIFY · **SYS-1/2** · P-MOVE-5 | Terra / Sol    |
| T1   | Cursor       | standalone fixture · **SYS-3** QML          | Auto           |
| T2   | Antigravity  | PWA 证据 · F-P6 baseline                | 无设备 suspend |
| T3   | Copilot      | 补全 / summary                          | —              |

---

## 2. 任务路由

```text
产品闭环 / 审核 IA / Slice 2 信息架构     → Fable（单 worktree）
设备生命周期 / SSH / systemd / suspend    → Codex
migrateTask / standalone PWA harness / SYS-3 设置 UI    → Cursor
浏览器截图                                 → Antigravity
```

### Fable 规则（修正冲突）

- **同时只跑一个 Fable 实现 worktree**
- P-SCHED-0 patch 等待期：可 **只读** 看 F-P6 Antigravity baseline；**不得** 开 F-P6 实现 worktree
- **P-SCHED-0 合并关闭后** 才能切换 F-P6a
- Slice 2 **设备合并** 需 Fable IA session，但 **不得** 绕过 SYS-1

### 不给 Fable

- SYS-0 日志采集 · SYS-1/2 集成 · VERIFY · migrateTask · FT-P5 主实现

---

## 3. 六条执行线

```text
Line A  Planner       P-SCHED-0 **BLOCKED**    Fable sign-off · Cursor standalone harness · Antigravity PWA
Line B  PaperOS Shell P-MOVE-UI · SYS-*      Codex · Ken · Cursor（SYS-3）· Fable IA only
Line C  Fitness       FT-P5                  Codex · Fable 短 review
Line D  快赢          P-P4 · F-P1b           Codex / Cursor
Line E  Paper 数据面  VERIFY · 5 · 6         Codex only
Line F  Finance       F-P6                   Fable（关 P-SCHED-0 后）· Codex · Antigravity
```

### Line B — PaperOS Shell（无 VERIFY）

| 阶段                      | 谁                           |
| ------------------------- | ---------------------------- |
| Slice 1.1 设备复验        | Ken + Cursor                 |
| SYS-0 discovery           | Codex + Ken（VERIFY 同窗口） |
| SYS-1 enter/exit/recovery | Codex + Cursor System 菜单   |
| SYS-2 sleep/wake          | Codex                        |
| SYS-3 settings            | Cursor + Fable ≤30m          |
| Slice 2 IA                | Fable（1.1 PASS 后）         |
| Slice 2 QML 真机          | Cursor — **SYS-1 后**        |

### Line E — Paper 数据平面（唯一 VERIFY DRI）

| 工作             | 谁                   |
| ---------------- | -------------------- |
| P-MOVE-VERIFY    | Codex + Ken          |
| P-MOVE-5 staging | Codex                |
| P-MOVE-6         | Codex — **SYS-2 后** |

---

## 4. Fable 优先队列

| 顺位 | 任务           | 条件                       |
| ---- | -------------- | -------------------------- |
| 1    | **P-SCHED-0**  | **BLOCKED** — SCH-0 ✅ · 待 standalone + 真机 + sign-off |
| 2    | **F-P6a**      | P-SCHED-0 **已合并关闭** — **当前禁止**                  |
| 3    | **Slice 2 IA** | 1.1 PASS；真机实现等 SYS-1 |
| 4    | FT-P5 review   | ≤30min                     |
| 5    | SYS-3 语义     | ≤30min                     |

---

## 5. 第一波并行（立即）

```text
Ken           Slice 1.1 + SYS-0 日志（同一 60–90min 窗口）

Fable         **暂停** — 待 standalone guard + 真机 iPhone 后 sign-off

Codex T1      FT-P5

Codex T2      P-MOVE-VERIFY → 紧接 P-MOVE-SYS-0

Cursor        standalone 注入 / isolated fixture（SCH-0 ✅ · harness `29f0c2ed` · 不动 C++/systemd）

Antigravity   F-P6 baseline only

Copilot       lint / summary
```

### P-SCHED-0 关闭后

```text
Fable    → F-P6a
Codex    → SYS-1 → SYS-2 →（后）P-MOVE-6
Cursor   → SYS-3 · Slice 2 QML（SYS-1 后）
Ken      → SYS-GATE 用例
```

---

## 6–8. Cursor / 额度 / 维护

| 意图               | 用法                      |
| ------------------ | ------------------------- |
| 设备 SSH / systemd | Codex shell               |
| 生命周期 QML       | Cursor — **SYS-0 完成后** |
| Fable XL           | Claude Code worktree      |

| 问题               | 答案                  |
| ------------------ | --------------------- |
| P-MOVE-6 何时？    | **SYS-2 之后**        |
| Slice 2 真机何时？ | **SYS-1 之后**        |
| VERIFY 谁负责？    | **仅 Line E / Codex** |

**维护：** Hub §Now ↔ §0 ↔ §依赖图 · lifecycle 文档 [`paperos-device-lifecycle-discovery.md`](../qa/paperos-device-lifecycle-discovery.md)

**相关：** [`planner-schedule-uiux-audit.md`](../qa/planner-schedule-uiux-audit.md) · [`PRO_MOVE.md`](../PRO_MOVE.md) · [`apps/planner-pro-move.md`](./apps/planner-pro-move.md)
