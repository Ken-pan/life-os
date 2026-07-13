---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-11-evening-checkpoint
doc_role: execution-routing
priority_model: 2026-07-11-distribution-correction
---

# Agent 执行分线（2026-07-12 · master `a13082e8` 复核）

> **Hub 真源：** `[../LIFEOS_ROADMAP.md](../LIFEOS_ROADMAP.md)` §Now / §Next（动态状态只看 Hub；本文 Playbook 少重复）
> **Ticket ID：** `[TICKET_NAMING.md](./TICKET_NAMING.md)` · **产品细节：** `[apps/](./apps/README.md)`
> **PaperOS 生命周期：** `[../qa/paperos-device-lifecycle/README.md](../qa/paperos-device-lifecycle/README.md)` · discovery `[../qa/paperos-device-lifecycle-discovery.md](../qa/paperos-device-lifecycle-discovery.md)` · gate `[../qa/paperos-device-lifecycle-gate.md](../qa/paperos-device-lifecycle-gate.md)`
> **可复制 Prompt：** §7（P0 审核修订后 · 含 `BASE_SHA` · 可分发）

**分发状态：** Playbook **PASS — READY TO DISTRIBUTE** · **方案 A（稳定优先）** · 活跃 lane **3**（Ken · Fable · Codex T1）· Antigravity **PLNR.SCHED.10a.sim Complete** · Codex T2 **Complete** · Cursor/Codex T3 Queued

**执行快照（2026-07-11 晚 · 对照 `origin/master` + 本地证据）：**


| Lane        | Hub ID               | 执行状态         | 证据 / 阻塞                                                                                    |
| ----------- | -------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Ken         | PAPR.UI · 10b.ios    | **Active**   | Slice 1.1 点验进行中 · **10b 真机 PWA 待证据**                                                       |
| Fable       | PLNR.SCHED.0.migrate | **Active**   | `migrateTask()` **仍未**默认 `tags: []` · 无 `migrate.integration.test.js`                      |
| Codex T1    | GYMS.SUB.5           | **Active**   | 工程 gate PASS · UI closure **未合入**（SkipModal 无 `aria-pressed` · Focus/Summary 文案未改）         |
| Antigravity | PLNR.SCHED.10a.sim   | **Complete** | `output/playwright/sch-10-planner/report.json` 2026-07-11 · baseline §9 **PASS simulated** |
| Codex T2    | PAPR.SYS.1b          | **Complete** | discovery 文档归档 ✅                                                                           |
| Cursor      | PLNR.SCHED.10.pwa    | **Queued**   | 等 Fable merge                                                                              |
| Codex T3    | PAPR.WRITE.5         | **Queued**   | 见 §5 启动条件                                                                                  |
| Copilot     | —                    | On demand    | —                                                                                          |


## TL;DR — 现在怎么分 Agent？

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Ken     Slice 1.1 · PLNR.SCHED.10b.ios（真机 PWA）— PAPR.SYS.1b discovery ✅ paused       │
├──────────────────────────────────────────────────────────────────────────┤
│  Fable   独占 PLNR.SCHED.0.migrate migrateTask（1 worktree）· FINC.PURCHASE.6.r0 只读待命          │
│  Codex   T1 GYMS.SUB.5 UI │ T2 PAPR.SYS.1b discovery docs ✅ │ T3 PAPR.WRITE.5 Queued  │
│  Cursor  **Queued** — Fable PLNR.SCHED.0.migrate merge 后接 PLNR.SCHED.10b.ios 修复               │
│  Antigravity  PLNR.SCHED.10a.sim ✅ Complete（simulated 证据）· FINC.PURCHASE.6 baseline 待命   │
│  Copilot  PR summary on demand（非持续 lane）                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**2026-07-11 关键修正：** PaperOS 是 **设备主 Shell**。**PAPR.DATA.verify ✅** · PAPR.SYS.0 accepted · **PAPR.SYS.1 launch architecture discovery complete**（PAPR.SYS.1a/1b.fs closed · PAPR.SYS.1b.jrn conditional pass）· **PAPR.SYS.1 DESIGN-READY · IMPLEMENTATION NOT AUTHORIZED · PAUSED BY OWNER**. Slice 2 可做 IA，真机合并不绕过 **PAPR.SYS.1**.

**启动模式定案：** **Mode A — Xochitl 默认** · 架构 **A 默认、B-ready**（`PAPR.SYS.3` Beta「解锁后自动进入 PaperOS」，默认 Off；见 discovery §产品假设）。


| 修正项                      | 内容                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Line 归属**              | **Line B** = Shell + UI + `**PAPR.SYS.*`** · **Line E** = `**PAPR.DATA.verify`** + `**PAPR.WRITE.5**` + `**PAPR.SYNC.6**`（数据平面）— `**PAPR.DATA.verify` 只属于 E** |
| **Fable**                | patch 等待期可 **只读** 审 FINC.PURCHASE.6 discovery；**不得** 开第二个实现 worktree                                                                                          |
| **FINC.PURCHASE.6**      | Discovery **CONDITIONAL PASS** · **FINC.PURCHASE.6.r0** 只读评审 · **FINC.PURCHASE.6.a impl BLOCKED**                                                             |
| **PLNR.SCHED.10.pwa**    | **10A** simulated CSS（Antigravity）**✅ Complete** · **10B** 真机 iOS PWA（Ken）— 不得混称                                                                              |
| **PLNR.SCHED.0.migrate** | **Fable 独占** `migrate.js` · Cursor **不得**碰 migrate · **代码未合入（2026-07-11 晚）**                                                                                  |
| **PAPR.SYNC.6**          | **暂缓** 至 `PAPR.SYS.2` 完成；suspend 下 Qt Timer 不继续                                                                                                               |
| **Ken**                  | 设备任务 = 明确矩阵（见 §Ken 设备窗口）                                                                                                                                      |
| **Prompt 原则**            | 约束优于说教 · 单任务单 worktree · 验收命令必写 · 人审后合并（见 §6–§7）                                                                                                              |


---

## 算力分配（2026-07-12）

### 主航道 — PaperOS lifecycle（强 AI · 明日优先）

| 平台               | 任务                                             | Hub ID                       | 状态           | 阻塞 / 交接                                                            |
| ---------------- | ---------------------------------------------- | ---------------------------- | ------------ | ------------------------------------------------------------------ |
| **Ken**          | Slice 1.1 · **PLNR.SCHED.10b.ios**             | PAPR.UI · PLNR.SCHED.10b.ios | **Active**   | PAPR.SYS.1b discovery **complete — paused**                        |
| **Claude Fable** | **PLNR.SCHED.0.migrate** `migrateTask` 独占      | PLNR.SCHED.0                 | **Active**   | `tags: []` 修复 **待合入** · 1 worktree                                 |
| **Codex T1**     | GYMS.SUB.5 UI/copy closure（方案 1）               | GYMS.SUB.5                   | **Active**   | 工程 PASS · UI closure **进行中**（代码未合入）                                |
| **Codex T2**     | PAPR.SYS.1b discovery 文档同步（只读证据归档）             | PAPR.SYS.1b                  | **Complete** | DESIGN-READY · impl **not authorized**                             |
| **Antigravity**  | **PLNR.SCHED.10a.sim** simulated standalone 证据 | PLNR.SCHED.10a.sim           | **Complete** | 2026-07-11 PASS simulated · `/today` 无 shell scroll 容器（路由布局差异，已记录） |
| **Cursor**       | PLNR.SCHED.10.pwa PWA 修复                       | PLNR.SCHED.10.pwa            | **Queued**   | **等 Fable PLNR.SCHED.0.migrate merge**                             |
| **Codex T3**     | PAPR.WRITE.5 write staging gate                | PAPR.WRITE.5                 | **Queued**   | 见 §5 Codex T3 启动条件                                                 |
| **Copilot**      | PR summary / lint                              | —                            | On demand    | 非持续 lane                                                           |

**主航道禁止分散到副线：** `PAPR.SYS.1/2` 集成 · journal watcher · `paperos-enter/exit` · lifecycle gate 真机矩阵 · `PAPR.WRITE.5` staging · `PAPR.SYNC.6`。

**暂停 / 后移：** `PAPR.SYNC.6` · `PAPR.SYS.2` · `PAPR.SYS.1` impl（**DESIGN-READY · IMPLEMENTATION NOT AUTHORIZED · paused by owner**）· Slice 2 真机合并 · FINC.PURCHASE.6.a UI · FINC.PURCHASE.6 baseline（Antigravity 待命 QA storage state）。

**Owner note:** Paused intentionally after architecture discovery. No active device lifecycle agent should continue without new owner authorization.

---

## 0. 当前并行分配（2026-07-12 · `a13082e8`）

### Critical finding（2026-07-11 更新）

PaperOS 正在接管 Home/Today、导航、笔记、Gallery、同步与 System Drawer，接近 **主 Shell**。

**2026-07-11 checkpoint：** 生命周期 **架构发现已完成**（PAPR.SYS.0 accepted · PAPR.SYS.1b.jrn conditional pass）。**PAPR.SYS.1 产品实现 intentionally paused by owner** — 无 watcher、无 launcher、无持久 systemd。

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
        PAPR.SYS.1 implementation ⏸ DESIGN-READY · IMPLEMENTATION NOT AUTHORIZED · PAUSED BY OWNER
              ├── Slice 2 device implementation（不得绕过 PAPR.SYS.1）
              ▼
        PAPR.SYS.2 sleep / wake / idle 🔒
              ├── PAPR.SYNC.6 Sync now + active timers + wake reconciliation 🔒
              └── PAPR.SYS.3 settings UI（与 PAPR.SYNC.6 可并行；均不阻塞对方）
              ▼
        PAPR.SYS.gate 🔒（需 PAPR.SYNC.6 + PAPR.SYS.3 均就绪）
```

PAPR.SYS.0 accepted conditional pass authorized bounded discovery. PAPR.SYS.1b.jrn conditional pass
established launch architecture feasibility — production design may begin only after owner authorization;
**implementation remains unauthorized**. PAPR.SYS.1 remains paused by owner.

### PAPR.SYS 任务摘要


| ID                  | 主题                      | Status (2026-07-11)                                                | Owner                      | 交付                                                                                     |
| ------------------- | ----------------------- | ------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------- |
| **PAPR.SYS.0**      | 生命周期发现                  | **accepted**                                                       | Codex + Ken                | `[paperos-device-lifecycle-discovery.md](../qa/paperos-device-lifecycle-discovery.md)` |
| **PAPR.SYS.1a**     | Triple-power launch     | **BLOCKED / closed**                                               | —                          | 不得实现                                                                                   |
| **PAPR.SYS.1b.fs**  | Filesystem signals      | **BLOCKED / closed**                                               | —                          | lastOpened / fd / snapshot 不可用                                                         |
| **PAPR.SYS.1b.jrn** | Journal UUID signal     | **CONDITIONAL PASS**                                               | Codex + Ken                | `EntityOpen::open` · 10/10 · 0 FP                                                      |
| **PAPR.SYS.1**      | enter / exit / recovery | **DESIGN-READY · IMPLEMENTATION NOT AUTHORIZED · PAUSED BY OWNER** | Codex · Cursor             | `paperos-enter/exit/recover` · journal watcher（均未开始）                                   |
| **PAPR.SYS.2**      | sleep / wake / idle     | **NOT STARTED**                                                    | Codex                      | pre-suspend flush · wake refresh · `lastSyncAt` 补偿                                     |
| **PAPR.SYS.3**      | Settings UI             | **OUT OF SCOPE**                                                   | Cursor · Fable ≤30m review | auto-sleep · **Launch after unlock [Beta] Off**                                        |
| **PAPR.SYS.gate**   | 真机可靠性                   | **BLOCKED**                                                        | Ken + Codex                | `[paperos-device-lifecycle-gate.md](../qa/paperos-device-lifecycle-gate.md)`           |


**PAPR.SYS.1 System 菜单最低项：** Sleep · Restart PaperOS · Return to reMarkable · Restart device · Shut down（危险操作确认）。

**PAPR.SYNC.6 约束：** 应用内 timer **不能**假定 system suspend 期间仍运行；须 **活跃期定时 + 唤醒按 `lastSyncAt` 补偿**；RTC 定时唤醒 = 实验，不进 MVP。

### PAPR.SYS.1b — Launcher Document discovery（2026-07-11 完成 · paused）

**Verdict:** PAPR.SYS.1b.fs **BLOCKED / CLOSED** · PAPR.SYS.1b.jrn **CONDITIONAL PASS accepted**.
Discovery sub-tasks **complete**; PAPR.SYS.1 implementation **not started — paused by owner**.


| 项        | 内容                                                                                    |
| -------- | ------------------------------------------------------------------------------------- |
| **方法**   | QA observer：`fd` + `snapshot` + `journalctl -fu xochitl`（见 `qa-tools/sys1b/`）         |
| **测试文档** | **Quick sheets**（discovery fixture only）· UUID `6dc48b38-4709-4c41-8b49-77d5e0b1630a` |
| **物理矩阵** | T-01–T-08 complete — 见 discovery §J1                                                  |
| **产出**   | journal `EntityOpen::open` UUID · 10/10 TP · 0 FP                                     |
| **阻塞条件** | FS 路线已关闭；JRN 为 conditional pass（OTA / fail-closed 风险保留）                               |
| **禁止**   | 将 QA scripts 描述为 production watcher · 无 owner 授权不得继续 impl                             |


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
| 4   | **PAPR.SYS.1b** launch discovery                          | ✅ PAPR.SYS.1b.jrn conditional pass · **paused** |
| 5   | **PLNR.SCHED.10b.ios** — 真机 iPhone Add to Home Screen PWA | 见下表 · `docs/qa/pwa-ios.md` L6                   |
| 6   | （PAPR.SYS.gate 阶段）LC-01–LC-15                             | lifecycle-gate.md                               |


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
| T1  | Claude Fable | **PLNR.SCHED.0.migrate** migrateTask · FINC.PURCHASE.6.r0 · Slice 2 IA | usage credits |
| T1  | Codex        | GYMS.SUB.5 UI · PAPR.SYS.1/2 · PAPR.WRITE.5                            | Terra / Sol   |
| T1  | Cursor       | **PLNR.SCHED.10.pwa** PWA（Queued）· **PAPR.SYS.3** QML                  | Auto          |
| T2  | Antigravity  | **PLNR.SCHED.10a.sim** ✅ · FINC.PURCHASE.6 baseline 待命                 | 无设备 suspend   |
| T3  | Copilot      | 补全 / summary                                                           | —             |


---

## 2. 任务路由

```text
产品闭环 / 审核 IA / Slice 2 信息架构     → Fable（单 worktree）
PLNR.SCHED.0.migrate migrateTask                         → Fable（独占）
设备生命周期 / SSH / systemd / suspend    → Codex
PLNR.SCHED.10.pwa PWA 修复 / PAPR.SYS.3 设置 UI           → Cursor（PLNR.SCHED.10.pwa 等 Fable merge 后）
PLNR.SCHED.10a.sim simulated 截图证据                → Antigravity
```

### Fable 规则（修正冲突）

- **同时只跑一个 Fable 实现 worktree**
- PLNR.SCHED.0 patch 等待期：可 **只读** 审 FINC.PURCHASE.6.r0 / discovery；**不得** 开 FINC.PURCHASE.6.a 实现 worktree
- **PLNR.SCHED.0 合并关闭后** → Cursor 可启动 PLNR.SCHED.10.pwa · Fable 可切换 FINC.PURCHASE.6.r0
- Slice 2 **设备合并** 需 Fable IA session，但 **不得** 绕过 PAPR.SYS.1

### 不给 Fable

- PAPR.SYS.0 日志采集 · PAPR.SYS.1/2 集成 · **PAPR.DATA.verify** · GYMS.SUB.5 UI closure（工程 ✅）

---

## 3. 六条执行线

```text
Line A  Planner       PLNR.SCHED.0              Fable（PLNR.SCHED.0.migrate）· Cursor（PLNR.SCHED.10.pwa Queued）· Antigravity（PLNR.SCHED.10a.sim ✅）
Line B  PaperOS Shell PAPR.UI · PAPR.SYS.*      Codex · Ken · Cursor（PAPR.SYS.3）· Fable IA only
Line C  Fitness       GYMS.SUB.5 UI closure         Codex · product re-review 待 UI
Line D  快赢          PLNR.CORE.4 · FINC.SYNC.1b           Codex / Cursor
Line E  Paper 数据面  PAPR.DATA.verify · PAPR.WRITE.5 · PAPR.SYNC.6         Codex only
Line F  Finance       FINC.PURCHASE.6                   Fable（关 PLNR.SCHED.0 后）· Codex · Antigravity
```

### Line B — PaperOS Shell（无 `PAPR.DATA.verify`）


| 阶段                             | 谁                            |
| ------------------------------ | ---------------------------- |
| Slice 1.1 设备复验                 | Ken + Cursor                 |
| PAPR.SYS.0 discovery           | ✅ accepted — Codex + Ken     |
| PAPR.SYS.1b launch discovery   | ✅ complete — paused by owner |
| PAPR.SYS.1 enter/exit/recovery | **PAUSED** — Codex + Cursor  |
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


| 顺位  | 任务                           | 条件                                                              |
| --- | ---------------------------- | --------------------------------------------------------------- |
| 1   | **PLNR.SCHED.0**             | **独占**                                                          |
| 2   | **FINC.PURCHASE.6.r0**       | PLNR.SCHED.0 关闭 · 只读 readiness 评审（**非** FINC.PURCHASE.6.a impl） |
| 3   | **Slice 2 IA**               | 1.1 PASS；真机实现等 PAPR.SYS.1                                       |
| 4   | GYMS.SUB.5 product re-review | ≤30min · Codex T1 UI 完成后                                        |
| 5   | PAPR.SYS.3 语义                | ≤30min                                                          |


---

## 5. 第一波并行（2026-07-12 · lifecycle 主航道 + 快赢副线）

### Active（3 lanes）

```text
Ken           Slice 1.1 + PLNR.SCHED.10b.ios（真机证据待提交）

Fable         PLNR.SCHED.0.migrate migrateTask 独占（1 worktree · 代码待合入）

Codex T1      GYMS.SUB.5 UI closure 方案 1（进行中）
```

### Completed

```text
Antigravity   PLNR.SCHED.10a.sim simulated standalone 证据 ✅ 2026-07-11
Codex T2      PAPR.SYS.1b discovery 文档归档 ✅
```

### 快赢副线（其他 Agent）

```text
Cursor        等 Fable PLNR.SCHED.0.migrate merge → PLNR.SCHED.10.pwa PWA 修复 + rebase 重跑 evidence
Codex T3      见下方启动条件 → PAPR.WRITE.5 write staging gate
Copilot       有 open PR 时 summary / lint
```

**Codex T3 启动条件（方案 A · 稳定优先）：**

1. Fable `PLNR.SCHED.0` 已 merge
2. Cursor `PLNR.SCHED.10.pwa` 已 merge，**或** Ken 书面确认与 Codex T3 文件清单零交集
3. `origin/master` clean and green
4. Ken 批准 Codex T3 具体文件清单

若不等 Cursor merge，启动前须证明 `intersection(Codex T3 files, Cursor files) = ∅` 并贴出清单。

### 合并顺序（Ken 定 · agent 不得自行 push master）

```text
1. Fable      PLNR.SCHED.0 / PLNR.SCHED.0.migrate  → master
2. Cursor     rebase on (1) → PLNR.SCHED.10.pwa → master
3. Codex T1   GYMS.SUB.5（独立 app，可与 1–2 并行 merge，但产品 gate 见下）
4. Codex T2   PAPR.SYS.1b discovery 文档 patch ✅（可与上并行）
5. Codex T3   PAPR.WRITE.5（§5 Codex T3 启动条件全部满足后）
```

**GYMS.SUB.5 产品 gate closure authority（二者至少其一，Codex 不得自行关闭）：**

- Ken 目视 PWA 验收，或
- Fable ≤30min product re-review

### PLNR.SCHED.0 关闭后

```text
Fable    → FINC.PURCHASE.6.r0 只读评审 · Slice 2 IA 规划（不真机合并）
Codex    →（owner 授权后）PAPR.SYS.1 design → PAPR.SYS.2 → PAPR.SYNC.6 ∥ PAPR.SYS.3
Cursor   → PLNR.SCHED.10.pwa（若未在 Queued 阶段完成）→ PAPR.SYS.3 QML · Slice 2 QML（PAPR.SYS.1 后）
Ken      → PLNR.SCHED.10b.ios ·（PAPR.SYS.gate 阶段）LC-01–LC-15
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
  apps/fitness/src/app.css（或项目内 skip-alt 样式文件）
  apps/fitness/src/lib/i18n/messages/en.js
  apps/fitness/src/lib/i18n/messages/zh.js
  apps/fitness/tests/substitution.spec.js

  若实际 i18n 路径与上述不同，先报告真实路径；
  仅允许增加 GYMS.SUB.5 所需 keys，不得顺手重构 locale。

Codex T2:
  docs/qa/paperos-device-lifecycle-discovery.md（lifecycle status sync only — lane closed）

Codex T3（Queued）:
  apps/planner/**/paper*write* · staging gate 相关（启动前 Ken 确认具体文件清单）

Cursor（Queued — Fable merge 后）:
  packages/theme/src/scroll-shell.css   # 共享层 — 见下方回归 gate
  packages/theme/src/ios-safari.css     # 共享层 — 见下方回归 gate
  scripts/pwa/**
  apps/planner 内 PWA 布局相关 CSS/Svelte（不得碰 migrate.js / migrate.test.js / migrate.integration.test.js）

  优先 Planner-local override；仅当证明问题来自共享 shell 时才改 packages/theme。
  若修改 packages/theme，必须额外运行：
    npm run qa:mobile-scroll
    npm run check:lifeos-boundaries
  并报告 Affected apps: Planner / Fitness / Finance / 其他已配置 PWA — 各 PASS 或 N/A。

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
## 任务：Slice 1.1 + PLNR.SCHED.10b.ios（PAPR.SYS.1b discovery ✅ paused）

**注意：** PAPR.SYS.1b discovery **complete** — do **not** resume T-02→T-08 or device lifecycle work without explicit owner authorization.

### 必读

- `docs/qa/paperos-device-lifecycle-discovery.md` §Future resume point
- `docs/qa/pwa-ios.md`（PLNR.SCHED.10b.ios 最终 gate）

### 执行顺序

1. Slice 1.1 点验 — toolbar · Gallery · recovery · Back
2. **PLNR.SCHED.10b.ios** — 真机 iPhone Add to Home Screen 验收 Planner `/calendar` 滚动

### 禁止

- 继续 PAPR.SYS.1b discovery · 安装 watcher · 新建 launcher 文档 · 设备 lifecycle 开发
- 把 PLNR.SCHED.10a.sim simulated 证据当作 PLNR.SCHED.10.pwa 最终 PASS

### 验收

- [ ] Slice 1.1 点验结果记入 pro-move 分卷
- [ ] PLNR.SCHED.10b.ios 真机证据（见 §Ken 设备窗口 10b Gate 表）：
  - Device · 精确 iOS · Install mode（Add to Home Screen）
  - 从 Home Screen 冷启动 · Route `/calendar`
  - 顶部 + 底部截图或短录屏 · 末项无遮挡 · 后台恢复仍可滚动
```

---

### 7.2 Claude Fable — PLNR.SCHED.0.migrate ✅ Complete · 下一任务

**模型：** Claude Opus / Fable · **worktree：** 独占 · **migrate lane 已关**

```markdown
## 任务：PLNR.SCHED.0 — legacy `tags` 崩溃修复（PLNR.SCHED.0.migrate P0）

**Hub ID：** PLNR.SCHED.0 · **Line A** · **不得**开第二个 worktree 或改 Fitness/Finance/PaperOS 设备代码。

### 背景

Legacy task 缺 `tags` 数组 → `task.tags is not iterable` 崩溃。
根因：`apps/planner/src/lib/persist/migrate.js` 的 `migrateTask()` spread `...t` 未默认 `tags: []`。
证据：`docs/qa/planner-schedule-uiux-audit.md` PLNR.SCHED.0.migrate · `planner-schedule-antigravity-baseline.md`。

### 范围（文件级锁 — 仅这些）

- `apps/planner/src/lib/persist/migrate.js`
- `apps/planner/src/lib/persist/migrate.test.js`
- `apps/planner/src/lib/persist/migrate.integration.test.js`（legacy task → migrate → Calendar/Timeline selector 不得抛 `task.tags is not iterable`）

### 禁止

- PLNR.SCHED.10.pwa / PWA CSS（Cursor Queued）
- PaperOS QML / systemd / `PAPR.SYS.*`
- FINC.PURCHASE.6.a 实现（仅 FINC.PURCHASE.6.r0 只读待命）

### 验收（全部须绿 — 禁止 `|| true`）

    cd apps/planner && npm test -- src/lib/persist/migrate.test.js src/lib/persist/migrate.integration.test.js
    cd apps/planner && npm run check
    cd apps/planner && npx vitest run src/lib/domain/schedule.test.js

- [ ] `migrateTask` 对缺失、null 或非数组 `tags` 规范化为 `[]`
- [ ] `migrate.integration.test.js`：legacy task → migrate → Calendar/Timeline selector 不抛 `task.tags is not iterable`
- [ ] schedule domain tests 无回归
- [ ] PR 链到 PLNR.SCHED.0.migrate · 不 claim PLNR.SCHED.10.pwa

### 交接

PLNR.SCHED.0 merge 后通知 Ken → 解锁 Cursor PLNR.SCHED.10.pwa Queued lane。
FINC.PURCHASE.6.a impl 仍 BLOCKED；FINC.PURCHASE.6.r0 只读评审待命。
```

---

## 任务 B（Next）：FINC.PURCHASE.6.r0 — 只读 readiness 评审

**模型：** GPT-5.x Codex · **范围：** `apps/fitness` only

```markdown
## 任务：GYMS.SUB.5 产品 UI/copy closure — 方案 1

**Hub ID：** GYMS.SUB.5 · **Line C** · 工程 gate 已 PASS — **不得**改状态模型/归因逻辑。

### 必读

- `apps/fitness/docs/FT-P5-ui-closure-guide.md`（方案 1 为默认路径）
- `apps/fitness/docs/FT-P5-substitution.md`（工程边界）

### 实施清单

1. `.skip-alt.active` — 主题色 background + border + 可读文字色（`app.css`）
2. `SkipModal.svelte` — `aria-pressed` on substitute buttons
3. 文案分支 — 0 sets → Skip；partial → Replace remaining sets（`messages/en.js` · `messages/zh.js` i18n keys）
4. `FocusSession.svelte` — 轻量 `Switched from {planned}` 过渡
5. `SummaryView.svelte` — `Replaced` badge / 独立行（非 `[Skipped] 2/4` 歧义）
6. `tests/substitution.spec.js` — 覆盖上述 UI/copy 变更

### 文件级锁（§6 — 仅这些）

- `SkipModal.svelte` · `FocusSession.svelte` · `SummaryView.svelte` · `app.css`
- `src/lib/i18n/messages/en.js` · `src/lib/i18n/messages/zh.js`（仅增 GYMS.SUB.5 keys）
- `tests/substitution.spec.js`

若 i18n 实际路径不同，先报告；不得重构 locale。

### 禁止

- `session.js` / `progression.js` / `sessionQueue.js` 状态机
- 方案 3 分段控件重构
- 未请求的 a11y 大重构（方案 2 radiogroup 可 follow-up PR）

### 验收

    cd apps/fitness && npm test -- tests/substitution.spec.js tests/session-queue.spec.js
    cd apps/fitness && npm run check

- [ ] 选中替代项肉眼可辨（非仅颜色 — 边框/背景）
- [ ] `aria-pressed` 在 DOM 上可见
- [ ] 产品 gate 项对照 guide §主要发现 全部 addressed

### 交接 / 产品 gate

- **Codex 不得**将 GYMS.SUB.5 产品 gate 标为 PASS
- 须 **Ken 目视验收** 或 **Fable ≤30min re-review**（至少其一）
- merge 后更新 Hub 产品 gate 状态
```

---

### 7.3 GYMS.SUB.5 — ✅ Complete

**模型：** GPT-5.x Codex shell · **lane closed 2026-07-11**

```markdown
## 任务：PAPR.SYS.1b — Discovery 文档同步（read-only · complete)

**Hub ID：** PAPR.SYS.1b · **状态：** Discovery **complete** · PAPR.SYS.1 impl **PAUSED**

### 必读

- `docs/qa/paperos-device-lifecycle-discovery.md`

### 你的工作（若 owner 重新授权 PAPR.SYS.1 design）

1. 仅更新 lifecycle 文档 — 不得实现 watcher / paperos-enter
2. 保持 PAPR.SYS.1 状态为 **DESIGN-READY · IMPLEMENTATION NOT AUTHORIZED · PAUSED BY OWNER**

### 禁止

- 设备 SSH · `systemctl enable` · 实现 `paperos-enter` · 宣称 PAPR.SYS.1 implementation 已授权（无 owner 授权）

### 验收

- [ ] Discovery verdict 与 §J1 矩阵一致
- [ ] Quick sheets 仅作 test fixture 表述
- [ ] 无密钥写入 git
```

---

### 7.4b Codex T2（Complete · 归档 · 2026-07-11）

**模型：** GPT-5.x Codex · **启动条件：** 见 §5「Codex T3 启动条件」（方案 A · 稳定优先）

```markdown
## 任务：PAPR.WRITE.5 — Controlled write staging gate

**Hub ID：** PAPR.WRITE.5 · **状态：** Queued · **PAPR.DATA.verify** ✅

### 启动前确认（全部满足方可开工）

1. Fable `PLNR.SCHED.0` 已 merge
2. Cursor `PLNR.SCHED.10.pwa` 已 merge，**或** Ken 书面确认文件清单零交集
3. `origin/master` clean and green
4. Ken 批准本任务具体文件清单

### 必读

- `docs/PRO_MOVE.md` · `docs/roadmap/apps/planner-pro-move.md`
- `docs/qa/paperos-data-plane-verify-2026-07-11.md`

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

**启动条件：** Fable PLNR.SCHED.0.migrate 已 merge 到 master · 须 rebase 同一 `BASE_SHA` lineage

```markdown
## 任务：PLNR.SCHED.10.pwa PWA 修复（非 PLNR.SCHED.0.migrate）

**Hub ID：** PLNR.SCHED.10.pwa · **状态：** Queued · **Line A**

### 背景

- **PLNR.SCHED.0.migrate 归 Fable** — 你 **不得** 修改 `migrate.js` / `migrate.test.js`
- PLNR.SCHED.10a.sim simulated 证据 **已由 Antigravity 交付（2026-07-11）**；你负责修 CSS/布局 + 配合 PLNR.SCHED.10b.ios
- 手动注入 `standalone-pwa` class ≠ 真 iOS PWA — 最终关闭须 Ken PLNR.SCHED.10b.ios

### 必读

- `docs/qa/planner-schedule-uiux-audit.md` SCH-1/10
- `docs/qa/pwa-ios.md` · `.cursor/rules/pwa-ios-debug.mdc`
- `packages/theme/src/scroll-shell.css` · `scripts/pwa/apps.config.mjs`

### 文件级锁

- `packages/theme/src/scroll-shell.css` · `packages/theme/src/ios-safari.css`（**共享层** — 优先 Planner-local override）
- `scripts/pwa/**`
- Planner PWA 布局相关（**不含** `persist/migrate`*）

### 范围

1. Fable merge 后 `git rebase origin/master`
2. `PWA_APP=planner npm run test:pwa` — 修 standalone-pwa 滚动
3. 单一主滚动容器 `.life-os-page-workspace`
4. 重跑全部 PWA evidence
5. **仅当**修改 `packages/theme` 时，额外运行 `npm run qa:mobile-scroll` 并报告各 app PASS/N/A

### 禁止

- `apps/planner/src/lib/persist/migrate.js` · `migrate.test.js` · `migrate.integration.test.js`
- PaperOS QML / systemd（直至 **PAPR.SYS.1 implementation authorized** — 当前 **DESIGN-READY · NOT AUTHORIZED · paused by owner**）

### 验收

    npm run pwa:build
    PWA_APP=planner npm run test:pwa

若改了 `packages/theme`：

    npm run qa:mobile-scroll
    npm run check:lifeos-boundaries

- [ ] `/calendar` mobile standalone 可滚动 · tabbar 不遮挡末项
- [ ] 若改 theme：Affected apps 报告（Planner / Fitness / Finance / 其他）各 PASS 或 N/A
- [ ] 注明：PASS = CSS fix · PLNR.SCHED.10.pwa 最终关闭仍须 Ken PLNR.SCHED.10b.ios
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

- Cursor（Queued）：可引用 10a 证据修 CSS；**不得** claim 真 iOS PWA
- Ken：**PLNR.SCHED.10b.ios** 为 `PLNR.SCHED.10.pwa` 最终关闭条件

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

**条件：** Slice 1.1 device PASS · **PAPR.SYS.1 implementation not authorized** 时仅产出 IA 文档（design-ready，不得真机合并）

### 必读

- `docs/qa/paperos-eink-uiux-agent-brief.md`
- `docs/qa/paperos-next-ui-update-guide.md` Slice 2 节
- `docs/qa/paperos-eink-uiux-gap-audit.md`

### 交付

- Slice 2 导航/页面清单 · 与 brief §6 P0 对照表
- 明确标注「QML 实现等 PAPR.SYS.1 implementation authorized（当前 DESIGN-READY · NOT AUTHORIZED · paused）」
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
| PLNR.SCHED.10.pwa 何时关闭？   | **PLNR.SCHED.10a.sim** simulated + **PLNR.SCHED.10b.ios** Ken 真机 PWA |
| PLNR.SCHED.0.migrate 谁负责？ | **仅 Fable** — Cursor 不得改 migrate                                     |
| GYMS.SUB.5 产品 gate？       | **Ken 或 Fable** — Codex 不得自行关闭                                       |


**维护：** Hub §Now ↔ §0 ↔ §依赖图 · §7 Prompt 随 Hub 更新 · lifecycle hub `[paperos-device-lifecycle/README.md](../qa/paperos-device-lifecycle/README.md)`

**审核修订清单（2026-07-11）：**

- P0-1～P0-5（首轮）：PLNR.SCHED.0.migrate 归 Fable · 去假绿 · 10a/10b 拆分 · SYS-1b verdict · WRITE.5 gate · BASE_SHA · 合并顺序 · GYMS.SUB.5 closure authority · SYS-1 impl paused
- P0-6：Codex T1 文件锁补全 i18n（`messages/en.js` · `messages/zh.js`）+ `substitution.spec.js`
- P0-7：Fable 增 `migrate.integration.test.js` — Calendar/Timeline consumer 链验收
- P0-8：PAPR.SYS.1 统一为 `DESIGN-READY · IMPLEMENTATION NOT AUTHORIZED`
- P0-9：Active lane 计数与 Completed 分区 · Ken 10b 不重复 Queued · **2026-07-11 晚：Antigravity → Complete，活跃 3 lane**
- P1：Cursor theme 全站回归 · Codex T3 启动条件 · WRITE.5 生产证据 · 10b Gate 表 · JRN design 约束

**Verdict：** Playbook `PASS — READY TO DISTRIBUTE` · 执行快照见文首表（2026-07-11 晚）

**下次核对触发：** Fable merge · Codex T1 UI PR · Ken 10b 证据 · Cursor 启动

- **2026-07-12（`a13082e8`）：** master 复核 — #15 migrate · #18 10.pwa · #19 GYMS ✅ Complete（Engineering PASS · Product gate PASS）· Fable→r0/UIUX · Cursor→Line D
- **2026-07-12：** 算力分配 — lifecycle 主航道 · 快赢任务池

**Verdict：** Playbook `PASS — READY TO DISTRIBUTE` · **2026-07-12 算力模型：Lifecycle 主航道 + 快赢副线**

**下次核对触发：** Ken **10b.ios** 证据 · Cursor Line D PR · Codex 主航道 PAPR.SYS.1 第一步

**相关：** `[planner-schedule-uiux-audit.md](../qa/planner-schedule-uiux-audit.md)` · `[archive/paperos/milestones-2026-07.md](../archive/paperos/milestones-2026-07.md)` · `[apps/paperos.md](./apps/paperos.md)`
