---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-12-master-a13082e8
doc_role: execution-routing
priority_model: 2026-07-12-lifecycle-primary
---

# Agent 执行分线（2026-07-12 · master `a13082e8` 复核）

> **Hub 真源：** `[../LIFEOS_ROADMAP.md](../LIFEOS_ROADMAP.md)` §Now / §Next（动态状态只看 Hub；本文 Playbook 少重复）
> **Ticket ID：** `[TICKET_NAMING.md](./TICKET_NAMING.md)` · **产品细节：** `[apps/](./apps/README.md)`
> **PaperOS 生命周期：** `[../qa/paperos/README.md](../qa/paperos/README.md)` · discovery `[../qa/paperos/lifecycle.md](../qa/paperos/lifecycle.md)` · gate `[../qa/paperos/lifecycle-gate.md](../qa/paperos/lifecycle-gate.md)`
> **可复制 Prompt：** §7（含 `BASE_SHA` · 可分发）

**分发状态：** Playbook **PASS — READY TO DISTRIBUTE** · **算力模型：Lifecycle 主航道 + 快赢副线** · **BASE_SHA：** `a13082e8`（`origin/master` 2026-07-12）

**执行快照（2026-07-12 · `origin/master` `a13082e8`）：**


| 梯队 | Lane | Hub ID | 状态 | 证据 / 阻塞 |
| ---- | ---- | ------ | ---- | ----------- |
| **主航道** | Ken | **PAPR.SYS.*** · PAPR.UI · **10b.ios** | **Primary** | lifecycle 设备 · **PLNR.SCHED.10b.ios 真机 PWA 待证据** |
| **主航道** | Codex | **PAPR.SYS.1** design → impl | **Primary** | discovery ✅ · Ken 分步授权 |
| **快赢副线** | Fable | **FINC.PURCHASE.6.r0** · PLNR.UIUX.0 | **Next** | migrate ✅ #15 · **不得**再开 migrate worktree |
| **快赢副线** | Cursor | **PLNR.CORE.4** / **FINC.SYNC.1b** | **Active** | 10.pwa 代码 ✅ #18 · 可领 Line D |
| **Complete** | — | PLNR.SCHED.0.migrate | **Complete** | #15 `5c66d51e` |
| **Complete** | — | PLNR.SCHED.10.pwa（代码） | **Complete** | #18 `73757b60` · **父 ticket 仍待 10b.ios** |
| **Complete** | — | GYMS.SUB.5 | **Complete** | #19 `67e72b81` · Engineering PASS · Product gate PASS · evidence `docs/qa/evidence/gyms-sub-5/` |
| **Complete** | Antigravity | PLNR.SCHED.10a.sim | **Complete** | 2026-07-11 simulated PASS |
| **Complete** | Codex T2 | PAPR.SYS.1b docs | **Complete** | discovery 归档 |
| **后移** | Codex T3 | PAPR.WRITE.5 | **Deferred** | DB `paper_device_actions` 未上生产 |
| On demand | Copilot | — | On demand | PR summary / lint |


## TL;DR — 现在怎么分 Agent？

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  ★ 主航道（强 AI 算力 · PaperOS lifecycle 第一优先级）                      │
│  Ken     PAPR.SYS.* 设备 · Slice 1.1 · PLNR.SCHED.10b.ios（真机 gate）    │
│  Codex   PAPR.SYS.1 design → impl（强模型 · 单 worktree · Ken 分步授权）    │
├──────────────────────────────────────────────────────────────────────────┤
│  快赢副线（其他 Agent）                                                    │
│  Fable   FINC.PURCHASE.6.r0 只读 · PLNR.UIUX.0 走查（migrate ✅ 已关）      │
│  Cursor  PLNR.CORE.4 │ FINC.SYNC.1b（10.pwa 代码 ✅ #18）                  │
│  Antigravity  FINC.PURCHASE.6 baseline 待命 · 10a.sim ✅                   │
│  Copilot  PR summary on demand                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**2026-07-12 算力定案：** PaperOS lifecycle = **主航道**（Ken + Codex）。快赢副线三项 **已完成**：`PLNR.SCHED.0.migrate` #15 · `PLNR.SCHED.10.pwa` #18 · `GYMS.SUB.5` #19（Engineering PASS · Product gate PASS）— 剩余为 **Ken 真机 10b**、**Line D 快赢**。

**架构基线不变：** PaperOS 是 **设备主 Shell**。**PAPR.DATA.verify ✅** · PAPR.SYS.0 accepted · **PAPR.SYS.1 launch architecture discovery complete**（PAPR.SYS.1a/1b.fs closed · PAPR.SYS.1b.jrn conditional pass）· **PAPR.SYS.1 DESIGN-READY** — 主航道可推进 design/分步 impl，**仍须 Ken 逐步授权**，不得副线 agent 越权实现 watcher/launcher。

**启动模式定案：** **Mode A — Xochitl 默认** · 架构 **A 默认、B-ready**（`PAPR.SYS.3` Beta「解锁后自动进入 PaperOS」，默认 Off；见 discovery §产品假设）。


| 修正项                      | 内容                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Line 归属**              | **Line B** = Shell + UI + `**PAPR.SYS.*`** · **Line E** = `**PAPR.DATA.verify`** + `**PAPR.WRITE.5**` + `**PAPR.SYNC.6**`（数据平面）— `**PAPR.DATA.verify` 只属于 E** |
| **Fable**                | patch 等待期可 **只读** 审 FINC.PURCHASE.6 discovery；**不得** 开第二个实现 worktree                                                                                          |
| **FINC.PURCHASE.6**      | Discovery **CONDITIONAL PASS** · **FINC.PURCHASE.6.r0** 只读评审 · **FINC.PURCHASE.6.a impl BLOCKED**                                                             |
| **PLNR.SCHED.10.pwa**    | **10A** simulated CSS（Antigravity）**✅ Complete** · **10B** 真机 iOS PWA（Ken）— 不得混称                                                                              |
| **PLNR.SCHED.0.migrate** | **Fable** — ✅ **Complete #15** · Cursor → **Line D**（`PLNR.CORE.4` / `FINC.SYNC.1b`） |
| **PAPR.SYNC.6**          | **暂缓** 至 `PAPR.SYS.2` 完成；suspend 下 Qt Timer 不继续                                                                                                               |
| **Ken**                  | 设备任务 = 明确矩阵（见 §Ken 设备窗口）                                                                                                                                      |
| **Prompt 原则**            | 约束优于说教 · 单任务单 worktree · 验收命令必写 · 人审后合并（见 §6–§7）                                                                                                              |


---

## 算力分配（2026-07-12）

### 主航道 — PaperOS lifecycle（强 AI · 明日优先）

| 谁 | 任务 | 为何占主算力 |
| --- | --- | --- |
| **Ken** | Slice 1.1 设备复验 · PAPR.SYS.* 真机观测 · LC 预备 · PLNR.SCHED.10b.ios | 唯一物理设备权限；lifecycle 证据不可代劳 |
| **Codex**（强模型） | **PAPR.SYS.1** design → 分步 impl · 与 Ken 对齐 journal watcher / enter-exit 契约 | discovery 已完成；这是发布阻塞项，需深度推理 + SSH/systemd |
| **Cursor**（按需） | PAPR.SYS.3 QML 设置壳 · Slice 2 IA 文档（**非**真机合并） | 仅当主航道需要 UI 并行且文件锁不冲突 |

**主航道禁止分散到副线：** `PAPR.SYS.1/2` 集成 · journal watcher · `paperos-enter/exit` · lifecycle gate 真机矩阵 · `PAPR.WRITE.5` staging · `PAPR.SYNC.6`。

### 快赢副线 — 其他 Agent（易出效果 · 不复杂）

**入选标准（须同时满足）：**

1. **投入 ≤1d**，文件/模块边界清晰（有 §6 文件锁或可归入 Line D）
2. **验收可脚本化** — `npm test` / `npm run check` / Playwright 截图，agent 可自证
3. **用户体感立竿见影** — 崩溃修复、选中态可见、PWA 可滚动、同步时间戳等
4. **零设备 SSH** · 零 Supabase migration 风险 · 零跨 app 大重构

| 优先级 | Hub ID | Agent | 状态 | 备注 |
| ---: | --- | --- | --- | --- |
| — | **PLNR.SCHED.0.migrate** | — | **✅ Complete** | #15 · 勿再分配 |
| — | **PLNR.SCHED.10.pwa**（代码） | — | **✅ Complete** | #18 · 父 ticket 待 **10b.ios** |
| — | **GYMS.SUB.5** | — | **✅ Complete** | #19 `67e72b81` · Engineering PASS · Product gate PASS |
| 1 | **PLNR.CORE.4** | Cursor / Codex | **Active** | Line D · ~0.5d |
| 2 | **FINC.SYNC.1b** | Cursor / Codex | **Active** | Line D · ~0.5d |
| 3 | **FINC.PURCHASE.6.r0** | Fable | **Next** | 只读评审 |
| 4 | **PLNR.UIUX.0** | Fable | **Next** | 走查 · 与 r0 二选一 worktree |
| 6 | **FINC.PURCHASE.6 baseline** | Antigravity | 待命 | 需 Ken storage state |

**副线合并顺序（已完成）：** #15 migrate → #18 10.pwa → #19 GYMS.SUB.5（均已在 `a13082e8` 祖先链上）。

| Hub ID | 为何不进副线 |
| --- | --- |
| **PAPR.WRITE.5** | staging gate 多条件 · 生产隔离 · 需专门 Codex 会话 |
| **FINC.PURCHASE.6.a** | Discovery 未解除 impl · JSONB mutation + 审核 UI |
| **PAPR.SYNC.6** | 硬依赖 `PAPR.SYS.2` · suspend 语义 |
| **PLNR.ATTACH.0** | Storage + metadata 新底座 |
| **Slice 2 QML 真机** | 不得绕过 **PAPR.SYS.1** |

---

## 0. 当前并行分配（2026-07-12 · `a13082e8`）

| 平台 | 任务 | Hub ID | 梯队 | 状态 | 阻塞 / 交接 |
| ---- | ---- | ------ | ---- | ---- | ----------- |
| **Ken** | **PAPR.SYS.*** · **10b.ios** | PAPR.SYS · PLNR.SCHED.10b.ios | 主航道 | **Primary** | lifecycle · 真机 PWA 证据 |
| **Codex** | **PAPR.SYS.1** design → impl | PAPR.SYS.1 | 主航道 | **Primary** | Ken 分步授权 |
| **Fable** | **FINC.PURCHASE.6.r0** / **PLNR.UIUX.0** | FINC · PLNR.UIUX | 快赢副线 | **Next** | migrate ✅ · 单 worktree |
| **Cursor** | **PLNR.CORE.4** / **FINC.SYNC.1b** | Line D | 快赢副线 | **Active** | 10.pwa ✅ #18 |
| **Antigravity** | FINC.PURCHASE.6 baseline | FINC | 待命 | On demand | QA storage state |
| **Codex T3** | PAPR.WRITE.5 | PAPR.WRITE.5 | 后移 | **Deferred** | 见 §5 |

**主航道专注：** `PAPR.SYS.*` · Slice 1.1 设备 · lifecycle gate。

**副线专注：** Line D 快赢 + Fable 评审/走查 + PLNR 产品 gate — **不得抢占主航道 Codex/Ken 会话**。

**暂停 / 后移：** `PAPR.SYNC.6` · `PAPR.SYS.2`（主航道 `PAPR.SYS.1` 分步完成后）· `PAPR.WRITE.5`（Deferred）· Slice 2 真机合并 · FINC.PURCHASE.6.a UI · FINC.PURCHASE.6 baseline（Antigravity 待命 QA storage state）。

**Owner note:** Lifecycle 为全局第一优先级；`PAPR.SYS.1` impl 按 Ken **分步授权**推进，副线 agent 不得自行实现 watcher/launcher。

---

## PaperOS lifecycle correction（2026-07-12）

### Critical finding（2026-07-12 更新）

PaperOS 正在接管 Home/Today、导航、笔记、Gallery、同步与 System Drawer，接近 **主 Shell**。**Lifecycle 为全局第一优先级** — 2026-07-12 起 **主航道分配最多强 AI 算力**（Ken 设备 + Codex `PAPR.SYS.*`）。

**2026-07-12 checkpoint：** 生命周期 **架构发现已完成**（PAPR.SYS.0 accepted · PAPR.SYS.1b.jrn conditional pass）。**PAPR.SYS.1** 进入 **主航道 Active** — design → **分步 impl**（Ken 逐步授权；非副线 agent 任务）。

**仍属发布阻塞（未实现）：**

- 专用设备端 production entry（launcher 文档 + journal watcher + `paperos-enter`）
- 睡眠/唤醒/电源键/Folio（PAPR.SYS.2）
- 重复崩溃、冷启动、48h、无 Mac 恢复（PAPR.SYS.gate）

**已解除的架构问题：** 无 Mac/SSH 进入的可行候选机制（journal `EntityOpen::open` UUID）— 见 discovery §J1。

### 推荐状态机（实现前以 PAPR.SYS.0 真机为准）

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
  PAPR.UI · PAPR.SYS.0/1/2/3 · PAPR.SYS.gate
  Owner: Codex 设备集成 + Cursor QML + Ken 设备 gate
  Fable: Slice 2 IA 语义 · PAPR.SYS.3 ≤30min review · 不拥有设备集成

Line E — Paper 数据平面
  PAPR.DATA.verify · PAPR.WRITE.5 · PAPR.SYNC.6
  Owner: Codex
```

`**PAPR.DATA.verify` 只属于 Line E**（从 Line B 移除，避免双 DRI）。

### 依赖图

```text
Slice 1.1 device PASS
        ├── Slice 2 IA（Fable 可规划，不真机合并）
        ▼
PAPR.DATA.verify ✅（Line E）
        ├── PAPR.WRITE.5 staging
        └──         PAPR.SYS.0 🟡 accepted
              ▼
        PAPR.SYS.1 launch-surface discovery ✅
          ├── PAPR.SYS.1a ❌ BLOCKED / closed
          ├── PAPR.SYS.1b.fs ❌ BLOCKED / closed
          └── PAPR.SYS.1b.jrn 🟡 CONDITIONAL PASS accepted
              ▼
        PAPR.SYS.1 implementation 🟡 PRIMARY LANE — design → 分步 impl（Ken 逐步授权）
              ├── Slice 2 device implementation（不得绕过 PAPR.SYS.1）
              ▼
        PAPR.SYS.2 sleep / wake / idle 🔒
              ├── PAPR.SYNC.6 Sync now + active timers + wake reconciliation 🔒
              └── PAPR.SYS.3 settings UI（与 PAPR.SYNC.6 可并行；均不阻塞对方）
              ▼
        PAPR.SYS.gate 🔒（需 PAPR.SYNC.6 + PAPR.SYS.3 均就绪）
```

PAPR.SYS.0 accepted conditional pass authorized bounded discovery. PAPR.SYS.1b.jrn conditional pass
established launch architecture feasibility — **2026-07-12 主航道 Active**：production design + 分步 impl（Ken 逐步授权；副线 agent 不得实现 watcher/launcher）。

### PAPR.SYS 任务摘要


| ID                  | 主题                      | Status (2026-07-11)                                                | Owner                      | 交付                                                                                     |
| ------------------- | ----------------------- | ------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------- |
| **PAPR.SYS.0**      | 生命周期发现                  | **accepted**                                                       | Codex + Ken                | `[paperos/lifecycle.md](../qa/paperos/lifecycle.md)` |
| **PAPR.SYS.1a**     | Triple-power launch     | **BLOCKED / closed**                                               | —                          | 不得实现                                                                                   |
| **PAPR.SYS.1b.fs**  | Filesystem signals      | **BLOCKED / closed**                                               | —                          | lastOpened / fd / snapshot 不可用                                                         |
| **PAPR.SYS.1b.jrn** | Journal UUID signal     | **CONDITIONAL PASS**                                               | Codex + Ken                | `EntityOpen::open` · 10/10 · 0 FP                                                      |
| **PAPR.SYS.1**      | enter / exit / recovery | **PRIMARY LANE — design → 分步 impl**                               | Codex · Ken · Cursor | `paperos-enter/exit/recover` · journal watcher（主航道推进）                                   |
| **PAPR.SYS.2**      | sleep / wake / idle     | **NOT STARTED**                                                    | Codex                      | pre-suspend flush · wake refresh · `lastSyncAt` 补偿                                     |
| **PAPR.SYS.3**      | Settings UI             | **OUT OF SCOPE**                                                   | Cursor · Fable ≤30m review | auto-sleep · **Launch after unlock [Beta] Off**                                        |
| **PAPR.SYS.gate**   | 真机可靠性                   | **BLOCKED**                                                        | Ken + Codex                | `[paperos/lifecycle-gate.md](../qa/paperos/lifecycle-gate.md)`           |


**PAPR.SYS.1 System 菜单最低项：** Sleep · Restart PaperOS · Return to reMarkable · Restart device · Shut down（危险操作确认）。

**PAPR.SYNC.6 约束：** 应用内 timer **不能**假定 system suspend 期间仍运行；须 **活跃期定时 + 唤醒按 `lastSyncAt` 补偿**；RTC 定时唤醒 = 实验，不进 MVP。

### PAPR.SYS.1b — Launcher Document discovery（2026-07-11 完成 · 2026-07-12 主航道接手）

**Verdict:** PAPR.SYS.1b.fs **BLOCKED / CLOSED** · PAPR.SYS.1b.jrn **CONDITIONAL PASS accepted**.
Discovery sub-tasks **complete**; **PAPR.SYS.1 主航道 Active** — Codex design → 分步 impl（Ken 逐步授权）。


| 项        | 内容                                                                                    |
| -------- | ------------------------------------------------------------------------------------- |
| **方法**   | QA observer：`fd` + `snapshot` + `journalctl -fu xochitl`（见 `qa-tools/sys1b/`）         |
| **测试文档** | **Quick sheets**（discovery fixture only）· UUID `6dc48b38-4709-4c41-8b49-77d5e0b1630a` |
| **物理矩阵** | T-01–T-08 complete — 见 discovery §J1                                                  |
| **产出**   | journal `EntityOpen::open` UUID · 10/10 TP · 0 FP                                     |
| **阻塞条件** | FS 路线已关闭；JRN 为 conditional pass（OTA / fail-closed 风险保留）                               |
| **禁止**   | 副线 agent 实现 watcher · 将 QA scripts 描述为 production watcher                             |


**Resume:** **2026-07-12 主航道 Active** — Codex `PAPR.SYS.1` design → 分步 impl；Ken 设备 gate 并行。

**Accepted journal token:**

```text
rm.library.ext.open
EntityOpen::open:
EntityId{<launcher-document-UUID>}
```

**Resume:** explicit owner authorization → `PAPR.SYS.1` design（见 discovery §Future resume point）.

**Production design 约束（JRN conditional pass — implementation 前须写入 design）：**

- fail closed：解析失败时不启动 PaperOS
- exact UUID match（不得模糊匹配）
- journal source / unit filter
- debounce / duplicate event handling
- watcher crash restart limit
- OTA version compatibility check
- emergency disable marker
- no launch on sync/indexing noise
- recovery to xochitl

> JRN token（`rm.library.ext.open` / `EntityOpen::open` / `EntityId{UUID}`）可能因 OTA 改变 — conditional pass **不是**稳定公开 API。

---

## Ken 设备窗口（主航道 · 明确矩阵）


| 顺序  | 任务                                                        | 验收                                              |
| --- | --------------------------------------------------------- | ----------------------------------------------- |
| 1   | Slice 1.1 点验（toolbar · Gallery · recovery）                | 通过/失败记入 pro-move 分卷                             |
| 2   | **PAPR.DATA.verify**                                      | ✅ PASS 2026-07-11                               |
| 3   | PAPR.SYS.0 lifecycle baseline                             | ✅ accepted                                      |
| 4   | **PAPR.SYS.1b** launch discovery                          | ✅ PAPR.SYS.1b.jrn conditional pass              |
| 5   | **PAPR.SYS.1** design 对齐 + 分步 impl 真机验证                  | 主航道 · 与 Codex 配对推进                              |
| 6   | **PLNR.SCHED.10b.ios** — 真机 iPhone Add to Home Screen PWA | 副线穿插 · 见下表 · `docs/qa/pwa-ios.md` L6           |
| 7   | （PAPR.SYS.gate 阶段）LC-01–LC-15                             | lifecycle-gate.md                               |


**PLNR.SCHED.10b.ios 真机 Gate（最低记录项）：**


| 项目           | 要求                                 |
| ------------ | ---------------------------------- |
| Device       | iPhone 型号                          |
| OS           | 精确 iOS 版本                          |
| Install mode | Safari → Add to Home Screen        |
| Launch       | 从 Home Screen 图标冷启动（非 Safari tab）  |
| Route        | `/calendar`                        |
| Scroll       | 能滚动到底                              |
| Occlusion    | 最后一项不被 tab bar / home indicator 遮挡 |
| Resume       | 切后台再返回后仍可滚动                        |
| Evidence     | 顶部 + 底部截图或短录屏                      |


---

## 1. 五平台分层


| 梯队  | 平台           | Life OS 角色                                                             | 默认            |
| --- | ------------ | ---------------------------------------------------------------------- | ------------- |
| T1  | Claude Fable | **FINC.PURCHASE.6.r0** · PLNR.UIUX.0 · Slice 2 IA | usage credits |
| T1  | Codex        | **PAPR.SYS.1/2**（主航道）                         | Terra / Sol   |
| T1  | Cursor       | **PLNR.CORE.4** / **FINC.SYNC.1b** · PAPR.SYS.3 QML | Auto          |
| T2  | Antigravity  | **PLNR.SCHED.10a.sim** ✅ · FINC.PURCHASE.6 baseline 待命                 | 无设备 suspend   |
| T3  | Copilot      | 补全 / summary                                                           | —             |


---

## 2. 任务路由

```text
产品闭环 / 审核 IA / Slice 2 信息架构     → Fable（单 worktree · migrate ✅ 后）
FINC.PURCHASE.6.r0 只读评审 / PLNR.UIUX.0  → Fable
PaperOS lifecycle / SSH / systemd / PAPR.SYS.* → Codex + Ken（主航道）
PLNR.CORE.4 / FINC.SYNC.1b                  → Cursor / Codex（Line D · Active）
PLNR.SCHED.10b.ios 真机 PWA                 → Ken（10.pwa 代码 ✅ #18）
```

### Fable 规则（修正冲突）

- **PLNR.SCHED.0.migrate** ✅ Complete（#15）— Fable **不得**再开 migrate worktree
- **PLNR.SCHED.0 父 ticket** 关闭条件：仅剩 **PLNR.SCHED.10b.ios** Ken 真机
- **PLNR.SCHED.10.pwa** 代码 ✅ #18 — Cursor 转 **Line D**
- Slice 2 **设备合并** 需 Fable IA session，但 **不得** 绕过 PAPR.SYS.1

### 不给 Fable

- PAPR.SYS.0 日志采集 · PAPR.SYS.1/2 集成 · **PAPR.DATA.verify** · GYMS.SUB.5（✅ Complete，勿重开实现）

---

## 3. 六条执行线

```text
Line A  Planner       PLNR.SCHED.0              migrate ✅ #15 · 10.pwa ✅ #18 · **10b.ios** Ken · Antigravity（10a ✅）
Line B  PaperOS Shell PAPR.UI · PAPR.SYS.*      Codex · Ken · Cursor（PAPR.SYS.3）· Fable IA only
Line C  Fitness       GYMS.SUB.5                **✅ Complete** · Engineering PASS · Product gate PASS · #19 `67e72b81`
Line D  快赢          PLNR.CORE.4 · FINC.SYNC.1b           Cursor / Codex **Active**
Line E  Paper 数据面  PAPR.DATA.verify · PAPR.WRITE.5 · PAPR.SYNC.6         Codex only
Line F  Finance       FINC.PURCHASE.6                   Fable（关 PLNR.SCHED.0 后）· Codex · Antigravity
```

### Line B — PaperOS Shell（无 `PAPR.DATA.verify`）


| 阶段                             | 谁                            |
| ------------------------------ | ---------------------------- |
| Slice 1.1 设备复验                 | Ken + Cursor                 |
| PAPR.SYS.0 discovery           | ✅ accepted — Codex + Ken     |
| PAPR.SYS.1b launch discovery   | ✅ complete — 主航道接手 |
| PAPR.SYS.1 enter/exit/recovery | **PRIMARY LANE** — Codex + Ken（分步授权）  |
| PAPR.SYS.2 sleep/wake          | Codex                        |
| PAPR.SYS.3 settings            | Cursor + Fable ≤30m          |
| Slice 2 IA                     | Fable（1.1 PASS 后）            |
| Slice 2 QML 真机                 | Cursor — **PAPR.SYS.1 后**    |


### Line E — Paper 数据平面（唯一 `PAPR.DATA.verify` DRI）


| 工作                   | 谁                        |
| -------------------- | ------------------------ |
| PAPR.DATA.verify     | Codex + Ken              |
| PAPR.WRITE.5 staging | Codex                    |
| PAPR.SYNC.6          | Codex — **PAPR.SYS.2 后** |


---

## 4. Fable 优先队列


| 顺位 | 任务 | 条件 |
| --- | --- | --- |
| 1 | **FINC.PURCHASE.6.r0** | migrate ✅ · 只读 readiness（**非** FINC.PURCHASE.6.a impl） |
| 2 | **PLNR.UIUX.0** | 与 r0 二选一 worktree · SCHED 代码轨已清 |
| 3 | **Slice 2 IA** | 1.1 PASS；真机实现等 PAPR.SYS.1 |
| 5 | PAPR.SYS.3 语义 | ≤30min |


---

## 5. 第一波并行（2026-07-12 · lifecycle 主航道 + 快赢副线）

### 主航道（明日强算力）

```text
Ken           PAPR.SYS.* 设备观测 · Slice 1.1 复验 · lifecycle gate 预备
              （穿插 PLNR.SCHED.10b.ios 真机证据）

Codex         PAPR.SYS.1 design → 分步 impl（强模型 · 单 worktree）
              与 Ken 配对 · 不得与副线抢同一 Codex 会话
```

### 快赢副线（其他 Agent）

```text
Fable         FINC.PURCHASE.6.r0 只读 · 或 PLNR.UIUX.0 走查（migrate ✅ 已关）

Cursor        PLNR.CORE.4 / FINC.SYNC.1b（Line D · Active）

Ken           PLNR.SCHED.10b.ios 真机
```

### Completed（master `a13082e8` 祖先链）

```text
#15  PLNR.SCHED.0.migrate     5c66d51e
#18  PLNR.SCHED.10.pwa 代码   73757b60
#19  GYMS.SUB.5 UI closure    67e72b81
Antigravity   PLNR.SCHED.10a.sim ✅ 2026-07-11
Codex T2      PAPR.SYS.1b discovery 文档 ✅
```

### Deferred / On demand

```text
Codex T3      PAPR.WRITE.5 — 复杂度高 · 不占明日主算力 · 见下方启动条件
Copilot       有 open PR 时 summary / lint
```

**Codex T3 启动条件（方案 A · 稳定优先 · 2026-07-12 更新）：**

1. ~~Fable `PLNR.SCHED.0` 已 merge~~ ✅ #15
2. ~~Cursor `PLNR.SCHED.10.pwa` 已 merge~~ ✅ #18 · **或** Ken 书面确认与 Codex T3 文件清单零交集
3. `origin/master` clean and green
4. Ken 批准 Codex T3 具体文件清单

若不等 Cursor merge，启动前须证明 `intersection(Codex T3 files, Cursor files) = ∅` 并贴出清单。

### 合并顺序（Ken 定 · agent 不得自行 push master）

```text
1. Fable      PLNR.SCHED.0.migrate  → master ✅ #15
2. Cursor     PLNR.SCHED.10.pwa     → master ✅ #18
3. Codex T1   GYMS.SUB.5            → master ✅ #19
4. Cursor     PLNR.CORE.4 / FINC.SYNC.1b（Line D · 可与主航道并行，文件零交集）
5. Codex T3   PAPR.WRITE.5（§5 启动条件全部满足后）
```

**GYMS.SUB.5 已关闭：** Engineering PASS · Product gate PASS · #19 `67e72b81` · evidence `docs/qa/evidence/gyms-sub-5/`。

### PLNR.SCHED.0 关闭后

```text
Fable    → FINC.PURCHASE.6.r0 只读评审 · PLNR.UIUX.0 走查 · Slice 2 IA 规划（不真机合并）
Cursor   → PLNR.CORE.4 · FINC.SYNC.1b（Line D）· PAPR.SYS.3 QML（主航道授权后）
Ken      → PLNR.SCHED.10b.ios（PLNR.SCHED.0 最终关闭）· PAPR.SYS.* 设备 gate
GYMS.SUB.5 → ✅ Complete（Engineering PASS · Product gate PASS）
Antigravity → FINC.PURCHASE.6 baseline（Ken 提供 QA storage state 后）
```

---

## 6. 多 Agent 协作原则（2026 最佳实践）

摘自 Cursor / AGENTS.md 社区共识，与本 repo 硬规则合并：


| 原则                     | 本 repo 落地                                  |
| ---------------------- | ------------------------------------------ |
| **规划与执行分离**            | 跨 3+ 文件先出 plan（文件清单 + 验收命令），人审后再改代码        |
| **一 agent 一 worktree** | Fable 独占实现 worktree；Codex T1/T2/T3 不得改同一文件 |
| **约束优于说教**             | Prompt 写「不得」边界，少写「记得」提醒                    |
| **验收可重跑**              | 每条 prompt 末尾附具体 shell 命令，agent 须跑绿再交       |
| **精确上下文**              | `@` 指向真源文档与函数，禁止让 agent 全库盲搜               |
| **人审后合并**              | Agent 不自行 push `master`；Ken 定合并顺序          |
| **上下文卫生**              | 单任务完成后开新 session；scratchpad 重写而非无限 append  |


**文件级锁（当前波次 · 未列出须先报告）：**

```text
Fable（migrate lane closed — 勿再改）:
  apps/planner/src/lib/persist/migrate.js
  apps/planner/src/lib/persist/migrate.test.js
  apps/planner/src/lib/persist/migrate.integration.test.js

GYMS.SUB.5（✅ Complete #19 — Engineering PASS · Product gate PASS；勿重开实现）:
  apps/fitness/src/lib/components/SkipModal.svelte
  apps/fitness/src/lib/components/FocusSession.svelte
  apps/fitness/src/lib/components/SummaryView.svelte
  apps/fitness/src/lib/app.css（skip-alt 样式）
  apps/fitness/src/lib/i18n/messages/en.js
  apps/fitness/src/lib/i18n/messages/zh.js
  apps/fitness/tests/substitution.spec.js

PLNR.SCHED.10.pwa（Complete #18 — 勿再改，除非 Ken 10b 证据要求微调）:
  packages/theme/src/scroll-shell.css
  packages/theme/src/ios-safari.css
  scripts/pwa/**
  apps/planner 内 PWA 布局相关 CSS/Svelte（不得碰 migrate.js）

Cursor（Active — Line D）:
  apps/planner/**（PLNR.CORE.4 — Today/Portal 计数）
  apps/portal/**（若 RPC/契约需对齐）
  apps/finance/extension/**（FINC.SYNC.1b）

Codex T3（Deferred — PAPR.WRITE.5）:
  apps/planner/**/paper*write* · staging gate 相关（启动前 Ken 确认具体文件清单）

Antigravity:
  docs/qa/planner-schedule-antigravity-baseline.md
  output/playwright/sch-10-planner/**
```

**共享 theme 回归 gate：** 若改 `packages/theme`，须额外运行 `npm run qa:mobile-scroll` · `npm run check:lifeos-boundaries` 并报告 Affected apps。

---

## 7. Agent Prompt 库（复制即用）

> **用法：** 新开 session → 粘贴 **§7.0 通用前缀 + 对应 §7.x 任务 Prompt**（须 self-contained）→ 附上 `@` 文件。改代码前 agent 须复述验收命令。
> **语言：** 对 Claude Fable 用英文 prompt 效果更好；对 Cursor/Codex 中英文均可。
> **后续优化（非阻塞）：** `npm run prompt:agent -- <task-id>` 自动组合前缀 + `BASE_SHA` + 验收命令。

### 7.0 通用前缀（每条 Prompt 必填）

```markdown
你在 Life OS monorepo（`/Users/kenpan/「Projects」/life-os`）工作。
先读根目录 `AGENTS.md`。动态状态真源：`docs/LIFEOS_ROADMAP.md`。

### Session pinning（启动时填写 · 不得自行更换）

BASE_SHA: <启动时 `git fetch origin && git rev-parse origin/master` 输出>
BRANCH: agent/<task-id>-<slug>
WORKTREE: ../life-os-<task-id> # 若用 worktree

开始前运行并贴出：
git fetch origin
git rev-parse origin/master
git status --short

若需 rebase：旧截图与测试证据失效，须全量重跑验收。

### 全局禁止

- 改 legacy 归档 repo · apps 互引 · 未授权 push master · 提交 `.env`/密钥
- 修改「文件级锁」§6 未列出的文件 — 须先停下报告
- 用 `|| true` / `2>/dev/null` 掩盖失败 gate

多文件改动前先列 plan（≤8 步）。完成前运行本文「验收」命令，贴通过摘要。
```

---

### 7.1 Ken

**角色：** 唯一有权做物理设备操作与 SSH discovery 的人。**主航道 · 明日强算力优先 lifecycle。**

```markdown
## 任务：PAPR.SYS.* 主航道 + Slice 1.1（2026-07-12 算力优先）

**梯队：** 主航道 · PaperOS lifecycle 第一优先级

### 必读

- `docs/qa/paperos/lifecycle.md` §Future resume point · §J1 矩阵
- `docs/qa/paperos/lifecycle-gate.md`（LC 预备）
- `docs/qa/pwa-ios.md`（PLNR.SCHED.10b.ios — 副线穿插）

### 执行顺序

1. Slice 1.1 点验 — toolbar · Gallery · recovery · Back
2. **PAPR.SYS.1** — 与 Codex 配对：design 对齐 · 分步 impl 真机验证（按 Ken 授权范围）
3. **PLNR.SCHED.10b.ios** — 真机 iPhone Add to Home Screen 验收 Planner `/calendar` 滚动（可穿插）

### 禁止

- 把副线任务（migrate / GYMS UI / PWA CSS）塞进主航道会话
- 把 PLNR.SCHED.10a.sim simulated 证据当作 PLNR.SCHED.10.pwa 最终 PASS
- 副线 agent 代做设备 SSH

### 验收

- [ ] Slice 1.1 点验结果记入 pro-move 分卷
- [ ] PAPR.SYS.1 分步进展与 Codex 对齐（design doc / 真机证据）
- [ ] PLNR.SCHED.10b.ios 真机证据（见 §Ken 设备窗口 10b Gate 表）：
  - Device · 精确 iOS · Install mode（Add to Home Screen）
  - 从 Home Screen 冷启动 · Route `/calendar`
  - 顶部 + 底部截图或短录屏 · 末项无遮挡 · 后台恢复仍可滚动
```

---

### 7.2 Claude Fable — PLNR.SCHED.0.migrate ✅ Complete · 下一任务

**模型：** Claude Opus / Fable · **worktree：** 独占 · **migrate lane 已关**

```markdown
## 任务 A（Complete · #15）：PLNR.SCHED.0.migrate — 勿再实现

**状态：** ✅ Shipped `5c66d51e` · `migrate.integration.test.js` 绿

---

## 任务 B（Next）：FINC.PURCHASE.6.r0 — 只读 readiness 评审

**Hub ID：** FINC.PURCHASE.6.r0 · **Line F** · **非** FINC.PURCHASE.6.a impl

### 必读

- `apps/finance/docs/FP6_PURCHASE_REVIEW.md`
- `apps/finance/docs/FP6_PURCHASE_REVIEW_DATA_CONTRACT.md`

### 交付

- 只读评审：数据层 blocker 是否解除 · FINC.PURCHASE.6.a 是否可授权
- **不得**实现 Confirm/Reject UI 或 JSONB mutation

---

## 任务 C（可选 Next）：PLNR.UIUX.0 — Planner 全站走查

**条件：** 与任务 B **二选一** worktree（同时只跑一个 Fable 实现 worktree）

### 必读

- `docs/qa/planner-task-display-spec.md`
- `docs/roadmap/apps/planner.md`

### 禁止

- `migrate.js`（已关）· PaperOS 设备 · FINC.PURCHASE.6.a impl
```

---

### 7.3 GYMS.SUB.5 — ✅ Complete

**模型：** — · **Lane closed** · **Engineering：PASS** · **Product gate：PASS**

```markdown
## 交付：GYMS.SUB.5 — 产品 gate closed

**Hub ID：** GYMS.SUB.5 · **状态：** ✅ Complete · Engineering PASS · Product gate PASS · #19 `67e72b81`

### 已交付（勿重复实现）

- `SkipModal.svelte` — `aria-pressed`
- `FocusSession.svelte` — `Switched from {planned}`
- `SummaryView.svelte` — `Replaced` badge
- `app.css` — `.skip-alt.active` 可见态
- `tests/substitution.spec.js` 6/6 PASS · 证据 `docs/qa/evidence/gyms-sub-5/`
- `npm run check` PASS · 393×852 live replacement smoke PASS · no horizontal overflow
```

---

### 7.4 Codex — 主航道 PAPR.SYS.1

**模型：** GPT-5.x Codex Terra/Sol · **梯队：** 主航道 · 明日强算力

```markdown
## 任务：PAPR.SYS.1 — enter / exit / recovery（主航道 · 2026-07-12）

**Hub ID：** PAPR.SYS.1 · **Line B** · discovery ✅ · **分步 impl 按 Ken 授权**

### 必读

- `docs/qa/paperos/lifecycle.md` — §J1 · §Future resume point · JRN design 约束
- `docs/archive/paperos/milestones-2026-07.md` · `docs/archive/paperos/milestones-2026-07.md`
- `docs/roadmap/apps/paperos.md` §PAPR.SYS

### 目标（按 Ken 授权分步）

1. Production design doc — fail-closed · exact UUID · debounce · OTA guard · emergency disable
2. `paperos-enter` / `paperos-exit` / `recover-xochitl` 脚本契约
3. Journal watcher prototype（非 QA `observe-sys1b.sh` 直搬）
4. 与 Ken 配对真机验证 — 每步有证据再进下一步

### 禁止

- 与副线（GYMS.SUB.5 / migrate / PWA）混在同一 worktree
- 宣称 PAPR.SYS.2 / PAPR.SYNC.6 已授权
- 跳过 design 约束直接 `systemctl enable`

### 验收

- [ ] Design doc 与 discovery §J1 矩阵一致
- [ ] 每步 impl 有 Ken 真机证据或明确 BLOCKED 原因
- [ ] 无密钥写入 git
```

---

### 7.4b Codex T2（Complete · 归档 · 2026-07-11）

> **2026-07-12 更新：** PAPR.SYS.1 已升为 **PRIMARY LANE**（§7.4）。本节仅作 discovery 归档参考；**勿**再按 PAUSED 口径分发。

```markdown
## 任务：PAPR.SYS.1b — Discovery 文档同步（read-only · complete)

**Hub ID：** PAPR.SYS.1b · **状态：** Discovery **complete** · PAPR.SYS.1 → **PRIMARY LANE**（2026-07-12）

### 必读

- `docs/qa/paperos/lifecycle.md`

### 你的工作（历史归档）

1. Discovery 文档已与 §J1 矩阵对齐 — **lane closed**
2. 后续 impl 见 §7.4 — **分步按 Ken 授权**

### 禁止

- 设备 SSH · `systemctl enable` · 无 Ken 授权的实现步骤

### 验收

- [ ] Discovery verdict 与 §J1 矩阵一致
- [ ] Quick sheets 仅作 test fixture 表述
- [ ] 无密钥写入 git
```

---

### 7.5 Codex T3（Deferred）

**模型：** GPT-5.x Codex · **启动条件：** 见 §5「Codex T3 启动条件」（2026-07-12：#15/#18 已满足 · 仍须 Ken 批准文件清单）

```markdown
## 任务：PAPR.WRITE.5 — Controlled write staging gate

**Hub ID：** PAPR.WRITE.5 · **状态：** Deferred · **PAPR.DATA.verify** ✅ · 生产缺 `paper_device_actions` 表

### 启动前确认（全部满足方可开工）

1. ~~Fable `PLNR.SCHED.0` 已 merge~~ ✅ #15
2. ~~Cursor `PLNR.SCHED.10.pwa` 已 merge~~ ✅ #18 · **或** Ken 书面确认与 Codex T3 文件清单零交集
3. `origin/master` clean and green
4. Ken 批准本任务具体文件清单
5. （建议）主航道 `PAPR.SYS.1` 当前分步不占用同一 Codex 会话

### 必读

- `docs/archive/paperos/milestones-2026-07.md` · `docs/roadmap/apps/paperos.md`
- `docs/qa/paperos/data-plane-2026-07-11.md`

### 目标

建立可验证的 write staging gate（非「仅有 plan」）。

### Write staging gates（须全部有测试或证据）

| Gate                 | 验证                                        |
| -------------------- | ------------------------------------------- |
| 默认关闭             | 未设 flag 时写不可达                        |
| Auth denial          | 无/错 token → 401/403                       |
| Env isolation        | staging 不写 production project             |
| Idempotency          | 重复 mutation 不重复创建                    |
| Validation           | 非法 payload 不落库                         |
| Read reconcile       | 写入后 read cache 一致                      |
| Rollback             | 禁用 flag + 清理 staging 数据               |
| Audit                | request ID / mutation type / 结果（无秘密） |
| Production untouched | 生产凭证/端点未被 staging runtime 触及（见报告必填） |

### 验收

    cd apps/planner && npm run test -- tests/paper-write-staging.spec.js
    cd apps/planner && npm run check
    npm run check:lifeos-boundaries
    git diff --check

### 报告必填

- Production credentials loaded: NO
- Production endpoint invoked: NO
- Production project reference reachable by staging runtime: NO
- Production route/config git diff: NONE
- Staging project ref verified: \<redacted fingerprint\>
- Staging mutation IDs: …
- Rollback exercised: PASS/FAIL

### 禁止

- 生产路由变更（无显式批准）· PAPR.SYS.1/2 implementation · 与 Fable migrate 文件重叠
```

---

### 7.6 Cursor — Line D 快赢（Active）

**启动条件：** `origin/master` 含 #15/#18/#19 · 领 **PLNR.CORE.4** 或 **FINC.SYNC.1b**（与主航道文件零交集）

```markdown
## 任务 A（Complete · #18）：PLNR.SCHED.10.pwa — CSS/滚动修复

**状态：** ✅ Shipped `73757b60` · **PLNR.SCHED.0 父 ticket 仍待 Ken PLNR.SCHED.10b.ios**

---

## 任务 B（Active）：PLNR.CORE.4 — Today 与 Portal 任务数对齐

见 §7.10 任务 A

---

## 任务 C（Active）：FINC.SYNC.1b — 扩展 last sync + retry

见 §7.10 任务 B
```

---

### 7.7 Antigravity

**角色：** 只产视觉证据 · 不改业务逻辑

```markdown
## 任务 A（Complete · 2026-07-11）：PLNR.SCHED.10a.sim — Simulated standalone CSS gate

**Hub ID：** PLNR.SCHED.10a.sim · **Line A** · **状态：Complete**

### 已交付

- `output/playwright/sch-10-planner/report.json`（2026-07-11T23:42Z）
- `docs/qa/planner-schedule-antigravity-baseline.md` §9 — **PASS simulated standalone CSS gate**
- `/calendar` · `/settings`：`canReachEnd: true` · `tabBarObscures: false`
- `/today`：该路由无 `.life-os-page-workspace` shell scroll 容器（已记录，非 10a 阻塞）

### 验收措辞（强制）

- ✅ 已写：**PASS simulated standalone CSS gate (PLNR.SCHED.10a.sim)**
- ❌ 禁止写：**PASS iOS PWA** / **PLNR.SCHED.10.pwa closed**

### 交接

- Cursor：**PLNR.SCHED.10.pwa** 代码 ✅ #18 · Line D **Active**
- Ken：**PLNR.SCHED.10b.ios** 为 `PLNR.SCHED.0` 父 ticket 最终关闭条件

---

## 任务 B（待命）：Finance FINC.PURCHASE.6 baseline

**阻塞：** Ken 提供 isolated QA storage state（`apps/finance/docs/FP6_QA_AUTH.md`）

    cd apps/finance && npm run qa:fp6:bootstrap
    node scripts/fp6-baseline-qa.mjs

- 仅 pre-mutation · **FINC.PURCHASE.6.a impl BLOCKED**
- 不得接收 service-role / DB URL / 生产密码
```

---

### 7.8 Copilot

```markdown
## 任务：Lint + PR Summary（只读/轻量）

### 范围

- 对 open PR 跑 `npm run check` / affected package lint
- 生成 3–5 句 PR summary：动机 · 风险 · 验收命令 · 未覆盖项

### 禁止

- 不 checkout 他人 active worktree
- 不 push · 不改 migrate.js / fitness session 核心 / PaperOS 设备路径

### 输出模板

**Summary:** …
**Test plan:** `cd apps/<x> && npm test …`
**Risks:** …
**Out of scope:** …
```

---

---

### 7.10 Cursor — 快赢 Line D（PLNR.CORE.4 / FINC.SYNC.1b）

**梯队：** 快赢副线 · **Active**（#15/#18/#19 已在 master · 与主航道文件零交集）

```markdown
## 任务 A：PLNR.CORE.4 — Today 与 Portal 任务数对齐

**Hub ID：** PLNR.CORE.4 · **Line D** · 投入 ~0.5d

### 目标

同账号、同日期：Planner Today 展示任务数与 Portal `portal_today_summary` 一致。

### 必读

- `docs/roadmap/apps/planner.md` §PLNR.CORE.4
- `packages/contracts` / Portal today summary 相关 RPC

### 验收

    cd apps/planner && npm test
    cd apps/planner && npm run check

- [ ] 同账号同日计数一致（附测试或手动步骤）
- [ ] 未改 migrate.js / PaperOS 设备路径

---

## 任务 B：FINC.SYNC.1b — 扩展 last sync + retry

**Hub ID：** FINC.SYNC.1b · **Line D** · 投入 ~0.5d

### 目标

Finance Chrome 扩展 popup：显示 last sync 时间戳、失败原因、一键 retry。

### 必读

- `docs/roadmap/apps/finance.md` §FINC.SYNC.1b
- `apps/finance/extension/`

### 验收

    cd apps/finance && npm run check

- [ ] popup 可见 timestamp · 失败可 retry
- [ ] 未触生产凭证
```

---

### 7.9 Fable 后置 — Slice 2 IA / FINC.PURCHASE.6.r0

```markdown
## 任务 A：FINC.PURCHASE.6.r0 readiness review（只读 · 非 FINC.PURCHASE.6.a impl）

**条件：** PLNR.SCHED.0 已关闭 · 数据 foundation + QA runtime 就绪

### 必读

- `apps/finance/docs/FP6_PURCHASE_REVIEW.md`
- `apps/finance/docs/FP6_PURCHASE_REVIEW_DATA_CONTRACT.md`

### 交付

- 只读评审：数据层 blocker 是否解除 · FINC.PURCHASE.6.a 是否可授权
- **不得**实现 Confirm/Reject UI 或 JSONB mutation

---

## 任务 B：PaperOS Slice 2 IA（无真机合并）

**条件：** Slice 1.1 device PASS · **PAPR.SYS.1** 主航道分步 impl 进行中 — IA 仅文档，不得真机合并

### 必读

- `docs/qa/paperos/ui-spec.md`
- `docs/qa/paperos/ui-spec.md` Slice 2 节
- `docs/qa/paperos/ui-spec.md`

### 交付

- Slice 2 导航/页面清单 · 与 brief §6 P0 对照表
- 明确标注「QML 真机实现等 PAPR.SYS.1 对应分步已获 Ken 授权」
- ≤30min PAPR.SYS.3 Settings 语义评审（Launch after unlock Beta Off）

### 禁止

- QML/C++ 真机合并 · 绕过 PAPR.SYS.1 的 launcher 假设
```

---

## 8. Cursor / 额度 / 维护


| 意图               | 用法                                    |
| ---------------- | ------------------------------------- |
| 设备 SSH / systemd | Codex shell                           |
| 生命周期 QML         | Cursor — **PAPR.SYS.1 后**（PAPR.SYS.3） |
| Fable XL         | Claude Code worktree                  |



| 问题                        | 答案                                                                   |
| ------------------------- | -------------------------------------------------------------------- |
| PAPR.SYNC.6 何时？           | **PAPR.SYS.2 之后**（与 PAPR.SYS.3 **可并行**）                              |
| PLNR.SCHED.10.pwa 何时关闭？   | 代码 ✅ #18 · **最终关闭** = Ken **PLNR.SCHED.10b.ios** 真机 PWA |
| PLNR.SCHED.0.migrate 谁负责？ | ✅ **Complete #15** — 勿再分配 |
| GYMS.SUB.5 产品 gate？       | **✅ Complete** · Engineering PASS · Product gate PASS · #19 `67e72b81` |


**维护：** Hub §Now ↔ §0 ↔ §算力分配 ↔ §依赖图 · §7 Prompt 随 Hub 更新 · lifecycle hub `[paperos/README.md](../qa/paperos/README.md)`

**审核修订清单：**

- **2026-07-12（`a13082e8`）：** master 复核 — #15 migrate · #18 10.pwa · #19 GYMS ✅ Complete（Engineering PASS · Product gate PASS）· Fable→r0/UIUX · Cursor→Line D
- **2026-07-12：** 算力分配 — lifecycle 主航道 · 快赢任务池

**Verdict：** Playbook `PASS — READY TO DISTRIBUTE` · **2026-07-12 算力模型：Lifecycle 主航道 + 快赢副线**

**下次核对触发：** Ken **10b.ios** 证据 · Cursor Line D PR · Codex 主航道 PAPR.SYS.1 第一步

**相关：** `[planner-schedule-uiux-audit.md](../qa/planner-schedule-uiux-audit.md)` · `[archive/paperos/milestones-2026-07.md](../archive/paperos/milestones-2026-07.md)` · `[apps/paperos.md](./apps/paperos.md)`
