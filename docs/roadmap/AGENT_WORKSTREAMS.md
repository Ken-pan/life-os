---
title: Agent Workstreams
owner: kenpan
last_verified: 2026-07-11-review-fix
doc_role: execution-routing
priority_model: 2026-07-11-lifecycle-correction
---

# Agent 执行分线（2026-07-11 · 审核修订版）

> **Hub 真源：** `[../LIFEOS_ROADMAP.md](../LIFEOS_ROADMAP.md)` §Now / §Next（动态状态只看 Hub；本文 Playbook 少重复）
> **产品细节：** `[apps/](./apps/README.md)`
> **PaperOS 生命周期：** `[../qa/paperos-device-lifecycle-discovery.md](../qa/paperos-device-lifecycle-discovery.md)` · `[../qa/paperos-device-lifecycle-gate.md](../qa/paperos-device-lifecycle-gate.md)`
> **可复制 Prompt：** §7（P0 审核修订后 · 含 `BASE_SHA` · 可分发）

**分发状态：** P0-1～P0-5 已修 · **方案 A（稳定优先）** · 活跃 lane **5**（Ken · Fable · Codex T1 · Codex T2 · Antigravity）

## TL;DR — 现在怎么分 Agent？

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Ken     SYS-1B 预注册 signal → T-02→T-08 · Slice 1.1 · SCH-10B（真机 PWA）│
├──────────────────────────────────────────────────────────────────────────┤
│  Fable   独占 SCH-0 migrateTask（1 worktree）· F-P6-R0 只读待命          │
│  Codex   T1 FT-P5 UI │ T2 SYS-1B 日志（只读）│ T3 P-MOVE-5 **Queued**    │
│  Cursor  **Queued** — Fable SCH-0 merge 后接 SCH-10B 修复               │
│  Antigravity  SCH-10A simulated standalone 证据 only                     │
│  Copilot  PR summary on demand（非持续 lane）                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**2026-07-11 关键修正：** PaperOS 是 **设备主 Shell**。**P-MOVE-VERIFY ✅** · SYS-0 accepted · **SYS-1 launch surface 未解决**（SYS-1A closed · SYS-1B active/incomplete）。Slice 2 可做 IA，真机合并不绕过 **SYS-1**。

**启动模式定案：** **Mode A — Xochitl 默认** · 架构 **A 默认、B-ready**（`SYS-3` Beta「解锁后自动进入 PaperOS」，默认 Off；见 discovery §产品假设）。


| 修正项           | 内容                                                                                      |
| ------------- | --------------------------------------------------------------------------------------- |
| **Line 归属**   | **Line B** = Shell + UI + **SYS** · **Line E** = VERIFY + 5 + 6（数据平面）— VERIFY **只属于 E** |
| **Fable**     | patch 等待期可 **只读** 审 F-P6 discovery；**不得** 开第二个实现 worktree                               |
| **F-P6**      | Discovery **CONDITIONAL PASS** · **F-P6-R0** 只读评审 · **F-P6a impl BLOCKED**              |
| **SCH-10**    | **10A** simulated CSS（Antigravity）· **10B** 真机 iOS PWA（Ken）— 不得混称                       |
| **SCH-0**     | **Fable 独占** `migrate.js` · Cursor **不得**碰 migrate                                      |
| **P-MOVE-6**  | **暂缓** 至 `SYS-2` 完成；suspend 下 Qt Timer 不继续                                              |
| **Ken**       | 设备任务 = 明确矩阵（见 §Ken 设备窗口）                                                                |
| **Prompt 原则** | 约束优于说教 · 单任务单 worktree · 验收命令必写 · 人审后合并（见 §6–§7）                                        |


---

## 0. 当前并行分配（方案 A · 2026-07-11）


| 平台               | 任务                                                      | Hub ID                       | 状态         | 阻塞 / 交接                  |
| ---------------- | ------------------------------------------------------- | ---------------------------- | ---------- | ------------------------ |
| **Ken**          | SYS-1B 预注册 signal + T-02→T-08 · Slice 1.1 · **SCH-10B** | P-MOVE-SYS-1B · UI · SCH-10B | **Active** | launch surface 未 verdict |
| **Claude Fable** | **SCH-0** `migrateTask` 独占                              | P-SCHED-0                    | **Active** | 1 worktree               |
| **Codex T1**     | FT-P5 UI/copy closure（方案 1）                             | FT-P5                        | **Active** | 产品 gate 须 Ken 或 Fable 关闭 |
| **Codex T2**     | SYS-1B SSH 日志分析（只读）                                     | SYS-1B                       | **Active** | SYS-1 impl **blocked**   |
| **Antigravity**  | **SCH-10A** simulated standalone 证据                     | SCH-10A                      | **Active** | 不得 claim iOS PWA PASS    |
| **Cursor**       | SCH-10 PWA 修复                                           | SCH-10                       | **Queued** | **等 Fable SCH-0 merge**  |
| **Codex T3**     | P-MOVE-5 write staging gate                             | P-MOVE-5                     | **Queued** | Planner base 稳定后启动       |
| **Copilot**      | PR summary / lint                                       | —                            | On demand  | 非持续 lane                 |


**暂停 / 后移：** `P-MOVE-6` · `SYS-2` · `SYS-1` impl · Slice 2 真机合并 · F-P6a UI · F-P6 baseline（Antigravity 待命 QA storage state）。

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

`**P-MOVE-VERIFY` 只属于 Line E**（从 Line B 移除，避免双 DRI）。

### 依赖图

```text
Slice 1.1 device PASS
        ├── Slice 2 IA（Fable 可规划，不真机合并）
        ▼
P-MOVE-VERIFY ✅（Line E）
        ├── P-MOVE-5 staging
        └── P-MOVE-SYS-0 🟡 accepted
              ▼
        SYS-1 launch-surface discovery 🔄
          ├── SYS-1A ❌ BLOCKED / closed
          └── SYS-1B 🔄 ACTIVE / INCOMPLETE
              ▼
        P-MOVE-SYS-1 implementation 🔒（blocked）
              ├── Slice 2 device implementation（不得绕过 SYS-1）
              ▼
        P-MOVE-SYS-2 sleep / wake / idle 🔒
              ├── P-MOVE-6 Sync now + active timers + wake reconciliation 🔒
              └── P-MOVE-SYS-3 settings UI（与 P-MOVE-6 可并行；均不阻塞对方）
              ▼
        P-MOVE-SYS-GATE 🔒（需 P-MOVE-6 + SYS-3 均就绪）
```

SYS-0 accepted conditional pass authorizes **bounded launch-surface read-only
discovery only** — not lifecycle implementation without a passing launch mechanism.

### P-MOVE-SYS 任务摘要


| ID           | 主题                      | Status (2026-07-11)     | Owner                      | 交付                                                                                     |
| ------------ | ----------------------- | ----------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| **SYS-0**    | 生命周期发现                  | **accepted**            | Codex + Ken                | `[paperos-device-lifecycle-discovery.md](../qa/paperos-device-lifecycle-discovery.md)` |
| **SYS-1A**   | Triple-power launch     | **BLOCKED / closed**    | —                          | 不得实现                                                                                   |
| **SYS-1B**   | Launcher Document       | **ACTIVE / INCOMPLETE** | Codex + Ken                | read-only discovery only                                                               |
| **SYS-1**    | enter / exit / recovery | **BLOCKED**             | Codex · Cursor 菜单          | `paperos-enter/exit/recover` · systemd · crash-loop fallback                           |
| **SYS-2**    | sleep / wake / idle     | **NOT STARTED**         | Codex                      | pre-suspend flush · wake refresh · `lastSyncAt` 补偿                                     |
| **SYS-3**    | Settings UI             | **OUT OF SCOPE**        | Cursor · Fable ≤30m review | auto-sleep · **Launch after unlock [Beta] Off**                                        |
| **SYS-GATE** | 真机可靠性                   | **BLOCKED**             | Ken + Codex                | `[paperos-device-lifecycle-gate.md](../qa/paperos-device-lifecycle-gate.md)`           |


**SYS-1 System 菜单最低项：** Sleep · Restart PaperOS · Return to reMarkable · Restart device · Shut down（危险操作确认）。

**P-MOVE-6 约束：** 应用内 timer **不能**假定 system suspend 期间仍运行；须 **活跃期定时 + 唤醒按 `lastSyncAt` 补偿**；RTC 定时唤醒 = 实验，不进 MVP。

### SYS-1B — Launcher Document discovery（细则）

**目标：** 找到 **唯一、可靠** 的「用户主动打开目标文档」信号，作为 Mode A 设备端
launch surface；**不安装** watcher、不持久化。


| 项        | 内容                                                                 |
| -------- | ------------------------------------------------------------------ |
| **方法**   | SSH 只读：`inotifywait` + `journalctl -fu xochitl` + 服务基线 watch       |
| **测试文档** | 现有 **Quick sheets**（非敏感）；记录 UUID，不新建/重命名 launcher 文档               |
| **物理矩阵** | T-01–T-08 — 见 discovery §物理操作测试矩阵                                  |
| **产出**   | 填妥矩阵「实测信号」列；真阳性/假阳性分析；verdict（PASS discovery / BLOCKED）            |
| **阻塞条件** | 无法 10/10 区分打开 vs 索引/缩略图/sync → SYS-1B **BLOCKED** → 不授权 SYS-1 impl |
| **禁止**   | systemd 安装 · 文档库写入 · XOVI · 三击监听 · `EVIOCGRAB`                     |


### Candidate signal schema（T-02 前必须预注册）

在跑物理矩阵前，Ken + Codex T2 **共同填写**（观察日志前不得事后拟合）：


| 字段                       | 说明                                  |
| ------------------------ | ----------------------------------- |
| **event source**         | inotify / journal / 二者组合            |
| **exact path / pattern** | 例：`*/{UUID}.content`                |
| **inotify event type**   | OPEN / CLOSE / MODIFY / …           |
| **journal token**        | xochitl 日志中可 grep 的固定片段             |
| **correlation window**   | 主动操作后 ≤ ___ ms 内的事件才算               |
| **required event order** | 例：OPEN → journal transition → CLOSE |
| **allowed noise**        | 缩略图 `.png`、索引扫描等明确排除项               |
| **classification rule**  | 满足以上全部 → 候选信号；否则不算                  |


**示例（占位，实测后替换）：** 主动打开后 800ms 内 `{UUID}.content` OPEN/CLOSE 且 journal 出现 document-view transition。

**验收（discovery only）：**


| 类别                            | 标准                                       |
| ----------------------------- | ---------------------------------------- |
| **T-04 真阳性**                  | 10/10 命中预注册 detector                     |
| **每个负例**（T-01–T-03、T-05–T-08） | 至少 **5 次**重复 · **0/5** 假阳性               |
| **T-05**                      | 干扰例 — 打开后返回/关闭；**不得**重复触发启动级信号           |
| **环境记录**                      | sync 开/关 · Xochitl 是否刚启动 · 后台缩略图/sync 噪声 |
| **detector 冻结**               | 矩阵中途 **不得**修改预注册规则                       |


**阻塞条件：** 无法达到上表 → SYS-1B **BLOCKED** → 不授权 SYS-1 impl。

**下一步（Ken）：** 与 Codex T2 预注册 schema → **T-02** scroll off/on without open。

---

## Ken 设备窗口（明确矩阵）


| 顺序  | 任务                                             | 验收                      |
| --- | ---------------------------------------------- | ----------------------- |
| 1   | Slice 1.1 点验（toolbar · Gallery · recovery）     | 通过/失败记入 pro-move 分卷     |
| 2   | VERIFY                                         | ✅ PASS 2026-07-11       |
| 3   | SYS-0 lifecycle baseline                       | ✅ accepted              |
| 4   | **SYS-1B T-02** — scroll thumbnail off/on（不打开） | 预注册 schema 完成后          |
| 5   | **SYS-1B T-03–T-08** — 完整矩阵 + verdict          | discovery §验收判定         |
| 6   | **SCH-10B** — 真机 iPhone Add to Home Screen PWA | `docs/qa/pwa-ios.md` L6 |
| 7   | （SYS-GATE 阶段）LC-01–LC-15                       | lifecycle-gate.md       |


---

## 1. 五平台分层


| 梯队  | 平台           | Life OS 角色                                   | 默认            |
| --- | ------------ | -------------------------------------------- | ------------- |
| T1  | Claude Fable | **SCH-0** migrateTask · F-P6-R0 · Slice 2 IA | usage credits |
| T1  | Codex        | FT-P5 UI · SYS-1/2 · P-MOVE-5                | Terra / Sol   |
| T1  | Cursor       | **SCH-10** PWA（Queued）· **SYS-3** QML        | Auto          |
| T2  | Antigravity  | **SCH-10A** simulated · F-P6 baseline 待命     | 无设备 suspend   |
| T3  | Copilot      | 补全 / summary                                 | —             |


---

## 2. 任务路由

```text
产品闭环 / 审核 IA / Slice 2 信息架构     → Fable（单 worktree）
SCH-0 migrateTask                         → Fable（独占）
设备生命周期 / SSH / systemd / suspend    → Codex
SCH-10 PWA 修复 / SYS-3 设置 UI           → Cursor（SCH-10 等 Fable merge 后）
SCH-10A simulated 截图证据                → Antigravity
```

### Fable 规则（修正冲突）

- **同时只跑一个 Fable 实现 worktree**
- P-SCHED-0 patch 等待期：可 **只读** 审 F-P6-R0 / discovery；**不得** 开 F-P6a 实现 worktree
- **P-SCHED-0 合并关闭后** → Cursor 可启动 SCH-10 · Fable 可切换 F-P6-R0
- Slice 2 **设备合并** 需 Fable IA session，但 **不得** 绕过 SYS-1

### 不给 Fable

- SYS-0 日志采集 · SYS-1/2 集成 · VERIFY · FT-P5 UI closure（工程 ✅）

---

## 3. 六条执行线

```text
Line A  Planner       P-SCHED-0              Fable（SCH-0）· Cursor（SCH-10 Queued）· Antigravity（SCH-10A）
Line B  PaperOS Shell P-MOVE-UI · SYS-*      Codex · Ken · Cursor（SYS-3）· Fable IA only
Line C  Fitness       FT-P5 UI closure         Codex · product re-review 待 UI
Line D  快赢          P-P4 · F-P1b           Codex / Cursor
Line E  Paper 数据面  VERIFY · 5 · 6         Codex only
Line F  Finance       F-P6                   Fable（关 P-SCHED-0 后）· Codex · Antigravity
```

### Line B — PaperOS Shell（无 VERIFY）


| 阶段                        | 谁                            |
| ------------------------- | ---------------------------- |
| Slice 1.1 设备复验            | Ken + Cursor                 |
| SYS-0 discovery           | ✅ accepted — Codex + Ken     |
| SYS-1B launch discovery   | Codex + Ken（read-only）       |
| SYS-1 enter/exit/recovery | **BLOCKED** — Codex + Cursor |
| SYS-2 sleep/wake          | Codex                        |
| SYS-3 settings            | Cursor + Fable ≤30m          |
| Slice 2 IA                | Fable（1.1 PASS 后）            |
| Slice 2 QML 真机            | Cursor — **SYS-1 后**         |


### Line E — Paper 数据平面（唯一 VERIFY DRI）


| 工作               | 谁                   |
| ---------------- | ------------------- |
| P-MOVE-VERIFY    | Codex + Ken         |
| P-MOVE-5 staging | Codex               |
| P-MOVE-6         | Codex — **SYS-2 后** |


---

## 4. Fable 优先队列


| 顺位  | 任务                      | 条件                                               |
| --- | ----------------------- | ------------------------------------------------ |
| 1   | **P-SCHED-0**           | **独占**                                           |
| 2   | **F-P6-R0**             | P-SCHED-0 关闭 · 只读 readiness 评审（**非** F-P6a impl） |
| 3   | **Slice 2 IA**          | 1.1 PASS；真机实现等 SYS-1                             |
| 4   | FT-P5 product re-review | ≤30min · Codex T1 UI 完成后                         |
| 5   | SYS-3 语义                | ≤30min                                           |


---

## 5. 第一波并行（方案 A · 可分发）

### Active（5 lanes）

```text
Ken           SYS-1B 预注册 schema → T-02→T-08 + Slice 1.1

Fable         SCH-0 migrateTask 独占（1 worktree）

Codex T1      FT-P5 UI closure 方案 1

Codex T2      SYS-1B 日志分析 + 维护 candidate signal schema（只读）

Antigravity   SCH-10A simulated standalone 证据
```

### Queued / On demand

```text
Cursor        等 Fable SCH-0 merge → SCH-10 PWA 修复 + rebase 重跑 evidence
Codex T3      等 Planner base 稳定 → P-MOVE-5 write staging gate
Copilot       有 open PR 时 summary / lint
Ken           SCH-10B 真机 iOS PWA（可与 SYS-1B 设备窗口穿插）
```

### 合并顺序（Ken 定 · agent 不得自行 push master）

```text
1. Fable      P-SCHED-0 / SCH-0  → master
2. Cursor     rebase on (1) → SCH-10 → master
3. Codex T1   FT-P5（独立 app，可与 1–2 并行 merge，但产品 gate 见下）
4. Codex T2   SYS-1B discovery 文档 patch（只读证据，可与上并行）
5. Codex T3   P-MOVE-5（Planner 稳定后）
```

**FT-P5 产品 gate closure authority（二者至少其一，Codex 不得自行关闭）：**

- Ken 目视 PWA 验收，或
- Fable ≤30min product re-review

### P-SCHED-0 关闭后

```text
Fable    → F-P6-R0 只读评审 · Slice 2 IA 规划（不真机合并）
Codex    → SYS-1B verdict →（若 PASS）SYS-1 → SYS-2 → P-MOVE-6 ∥ SYS-3
Cursor   → SCH-10（若未在 Queued 阶段完成）→ SYS-3 QML · Slice 2 QML（SYS-1 后）
Ken      → SCH-10B · SYS-GATE 用例
Antigravity → F-P6 baseline（Ken 提供 QA storage state 后）
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
Fable:
  apps/planner/src/lib/persist/migrate.js
  apps/planner/src/lib/persist/migrate.test.js

Codex T1:
  apps/fitness/src/lib/components/SkipModal.svelte
  apps/fitness/src/lib/components/FocusSession.svelte
  apps/fitness/src/lib/components/SummaryView.svelte
  apps/fitness/src/app.css（或项目内 skip-alt 样式文件）

Codex T2:
  docs/qa/paperos-device-lifecycle-discovery.md（§物理操作测试矩阵 · candidate schema 列 only）

Codex T3（Queued）:
  apps/planner/**/paper*write* · staging gate 相关（启动前 Ken 确认具体文件清单）

Cursor（Queued — Fable merge 后）:
  packages/theme/src/scroll-shell.css
  packages/theme/src/ios-safari.css
  scripts/pwa/**
  apps/planner 内 PWA 布局相关 CSS/Svelte（不得碰 migrate.js / migrate.test.js）

Antigravity:
  docs/qa/planner-schedule-antigravity-baseline.md
  output/playwright/sch-10-planner/**
```

---

## 7. Agent Prompt 库（复制即用）

> **用法：** 新开 session → 粘贴对应 prompt → 附上 `@` 文件。改代码前 agent 须复述验收命令。
> **语言：** 对 Claude Fable 用英文 prompt 效果更好；对 Cursor/Codex 中英文均可。

### 7.0 通用前缀（每条 Prompt 必填）

```markdown
你在 Life OS monorepo（`/Users/kenpan/「Projects」/life-os`）工作。
先读根目录 `AGENTS.md`。动态状态真源：`docs/LIFEOS_ROADMAP.md`。

### Session pinning（启动时填写 · 不得自行更换）
BASE_SHA: <启动时 `git fetch origin && git rev-parse origin/master` 输出>
BRANCH: agent/<task-id>-<slug>
WORKTREE: ../life-os-<task-id>   # 若用 worktree

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

**角色：** 唯一有权做物理设备操作与 SSH discovery 的人。

```markdown
## 任务：P-MOVE-SYS-1B 物理矩阵 + Slice 1.1 + SCH-10B

**时间盒：** 45–60 分钟 · **模式：** read-only discovery

### 必读
- `docs/qa/paperos-device-lifecycle-discovery.md` §Candidate signal schema · §物理操作测试矩阵
- `docs/qa/paperos-data-plane-verify-2026-07-11.md`
- `docs/qa/pwa-ios.md`（SCH-10B 最终 gate）

### 执行顺序
0. **与 Codex T2 预注册 candidate signal schema**（观察日志前冻结 detector）
1. Slice 1.1 点验 — toolbar · Gallery · recovery · Back
2. SYS-1B 三终端 SSH 监控
3. 矩阵：T-02 → T-03 → T-04（≥10×）→ T-05（干扰例）→ T-06–T-08
4. 每个负例 **≥5 次** · 记录 sync 状态 · Xochitl 是否刚启动
5. **SCH-10B** — 真机 iPhone Add to Home Screen 验收 Planner `/calendar` 滚动（最终关闭 SCH-10）

### 禁止
- 安装 paperos.service · 新建 launcher 文档 · XOVI · 三击 · `EVIOCGRAB`
- 矩阵中途修改预注册 detector
- 把 SCH-10A simulated 证据当作 SCH-10 最终 PASS

### 验收
- [ ] Candidate signal schema 已填写且冻结
- [ ] T-04：10/10 真阳性（若已跑）
- [ ] 每个负例：≥5 次 · 0/5 假阳性
- [ ] SCH-10B 真机证据路径（截图 + 备注机型/iOS）
- [ ] verdict 草案：PASS discovery / BLOCKED / INCOMPLETE
```

---

### 7.2 Claude Fable

**模型：** Claude Opus / Fable · **worktree：** 独占 `apps/planner`

```markdown
## 任务：P-SCHED-0 — legacy `tags` 崩溃修复（SCH-0 P0）

**Hub ID：** P-SCHED-0 · **Line A** · **不得**开第二个 worktree 或改 Fitness/Finance/PaperOS 设备代码。

### 背景
Legacy task 缺 `tags` 数组 → `task.tags is not iterable` 崩溃。
根因：`apps/planner/src/lib/persist/migrate.js` 的 `migrateTask()` spread `...t` 未默认 `tags: []`。
证据：`docs/qa/planner-schedule-uiux-audit.md` SCH-0 · `planner-schedule-antigravity-baseline.md`。

### 范围（文件级锁 — 仅这些）
- `apps/planner/src/lib/persist/migrate.js`
- `apps/planner/src/lib/persist/migrate.test.js`

### 禁止
- SCH-10 / PWA CSS（Cursor Queued）
- PaperOS QML / systemd / SYS-*
- F-P6a 实现（仅 F-P6-R0 只读待命）

### 验收（全部须绿 — 禁止 `|| true`）

    cd apps/planner && npm test -- src/lib/persist/migrate.test.js
    cd apps/planner && npm run check
    cd apps/planner && npx vitest run src/lib/domain/schedule.test.js

- [ ] legacy fixture（无 tags）不再崩溃 Calendar/Timeline
- [ ] schedule.test.js **必须真绿** — 失败则不得 claim SCH-0 PASS
- [ ] PR 链到 SCH-0 · 不 claim SCH-10

### 交接
P-SCHED-0 merge 后通知 Ken → 解锁 Cursor SCH-10 Queued lane。
F-P6a impl 仍 BLOCKED；F-P6-R0 只读评审待命。
```

---

### 7.3 Codex T1

**模型：** GPT-5.x Codex · **范围：** `apps/fitness` only

```markdown
## 任务：FT-P5 产品 UI/copy closure — 方案 1

**Hub ID：** FT-P5 · **Line C** · 工程 gate 已 PASS — **不得**改状态模型/归因逻辑。

### 必读
- `apps/fitness/docs/FT-P5-ui-closure-guide.md`（方案 1 为默认路径）
- `apps/fitness/docs/FT-P5-substitution.md`（工程边界）

### 实施清单
1. `.skip-alt.active` — 主题色 background + border + 可读文字色（`app.css`）
2. `SkipModal.svelte` — `aria-pressed` on substitute buttons
3. 文案分支 — 0 sets → Skip；partial → Replace remaining sets（i18n keys）
4. `FocusSession.svelte` — 轻量 `Switched from {planned}` 过渡
5. `SummaryView.svelte` — `Replaced` badge / 独立行（非 `[Skipped] 2/4` 歧义）

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
- **Codex 不得**将 FT-P5 产品 gate 标为 PASS
- 须 **Ken 目视验收** 或 **Fable ≤30min re-review**（至少其一）
- merge 后更新 Hub 产品 gate 状态
```

---

### 7.4 Codex T2

**模型：** GPT-5.x Codex shell · **设备 SSH 只读**

```markdown
## 任务：SYS-1B — Candidate signal 维护 + 日志分析（read-only）

**Hub ID：** P-MOVE-SYS-1B · **状态：** Active · **SYS-1 impl BLOCKED**

### 必读
- `docs/qa/paperos-device-lifecycle-discovery.md` §Candidate signal schema · §物理操作测试矩阵

### 你的工作
1. **T-02 前**：与 Ken 共同填写并冻结 candidate signal schema（不得事后拟合）
2. 维护 SSH 监控（inotify + journalctl）— 只读
3. 矩阵每行：用**冻结的** detector 判定真/假阳性
4. 仅更新 `docs/qa/paperos-device-lifecycle-discovery.md` 矩阵列 + schema 表

### 文件级锁
- `docs/qa/paperos-device-lifecycle-discovery.md` only

### 禁止
- `systemctl enable` · 写文档库 · 实现 `paperos-enter` · 修改 detector 规则（矩阵中途）
- 宣称 SYS-1 可开工

### 验收
- [ ] Schema 在 T-02 前已填写
- [ ] T-04：10/10 · 负例各 ≥5 次 0/5 假阳性（或标注 INCOMPLETE）
- [ ] verdict 建议与 §验收判定 一致
- [ ] 无密钥写入 git
```

---

### 7.5 Codex T3（Queued）

**模型：** GPT-5.x Codex · **启动条件：** Fable SCH-0 已 merge · Planner base 稳定

```markdown
## 任务：P-MOVE-5 — Controlled write staging gate

**Hub ID：** P-MOVE-5 · **状态：** Queued · VERIFY ✅

### 必读
- `docs/PRO_MOVE.md` · `docs/roadmap/apps/planner-pro-move.md`
- `docs/qa/paperos-data-plane-verify-2026-07-11.md`

### 目标
建立可验证的 write staging gate（非「仅有 plan」）。

### Write staging gates（须全部有测试或证据）

| Gate | 验证 |
| --- | --- |
| 默认关闭 | 未设 flag 时写不可达 |
| Auth denial | 无/错 token → 401/403 |
| Env isolation | staging 不写 production project |
| Idempotency | 重复 mutation 不重复创建 |
| Validation | 非法 payload 不落库 |
| Read reconcile | 写入后 read cache 一致 |
| Rollback | 禁用 flag + 清理 staging 数据 |
| Audit | request ID / mutation type / 结果（无秘密） |
| Production untouched | 生产路由与 DB 无 diff |

### 验收

    cd apps/planner && npm run test -- tests/paper-write-staging.spec.js
    cd apps/planner && npm run check
    npm run check:lifeos-boundaries
    git diff --check

### 报告必填
- Production route diff: NONE
- Production environment accessed: NO
- Staging mutation IDs: …
- Rollback exercised: PASS/FAIL

### 禁止
- 生产路由变更（无显式批准）· SYS-1/2 · 与 Fable migrate 文件重叠
```

---

### 7.6 Cursor（Queued）

**启动条件：** Fable SCH-0 已 merge 到 master · 须 rebase 同一 `BASE_SHA`  lineage

```markdown
## 任务：SCH-10 PWA 修复（非 SCH-0）

**Hub ID：** SCH-10 · **状态：** Queued · **Line A**

### 背景
- **SCH-0 归 Fable** — 你 **不得** 修改 `migrate.js` / `migrate.test.js`
- SCH-10A simulated 证据由 Antigravity 产出；你负责修 CSS/布局 + 配合 SCH-10B
- 手动注入 `standalone-pwa` class ≠ 真 iOS PWA — 最终关闭须 Ken SCH-10B

### 必读
- `docs/qa/planner-schedule-uiux-audit.md` SCH-1/10
- `docs/qa/pwa-ios.md` · `.cursor/rules/pwa-ios-debug.mdc`
- `packages/theme/src/scroll-shell.css` · `scripts/pwa/apps.config.mjs`

### 文件级锁
- `packages/theme/src/scroll-shell.css`
- `packages/theme/src/ios-safari.css`
- `scripts/pwa/**`
- Planner PWA 布局相关（**不含** persist/migrate）

### 范围
1. Fable merge 后 `git rebase origin/master`
2. `PWA_APP=planner npm run test:pwa` — 修 standalone-pwa 滚动
3. 单一主滚动容器 `.life-os-page-workspace`
4. 重跑全部 PWA evidence

### 禁止
- `apps/planner/src/lib/persist/migrate.js` · `migrate.test.js`
- PaperOS QML / systemd（直至 SYS-1B verdict）

### 验收

    npm run pwa:build
    PWA_APP=planner npm run test:pwa

- [ ] `/calendar` mobile standalone 可滚动 · tabbar 不遮挡末项
- [ ] 注明：PASS = CSS fix · SCH-10 最终关闭仍须 Ken SCH-10B
```

---

### 7.7 Antigravity

**角色：** 只产视觉证据 · 不改业务逻辑

```markdown
## 任务 A（Active）：SCH-10A — Simulated standalone CSS gate

**Hub ID：** SCH-10A · **Line A**

### 目标
验证 `html.standalone-pwa` class 存在时的 CSS 行为 — **不是**真 iOS PWA。

### 步骤
1. `npm run pwa:build && npm run pwa:preview:planner`
2. Playwright 注入：`document.documentElement.classList.add('standalone-pwa')`
3. 路由：`/today` · `/calendar` · `/settings`（mobile viewport）
4. 输出 → `output/playwright/sch-10-planner/` + `report.json`

### 文件级锁
- `docs/qa/planner-schedule-antigravity-baseline.md`
- `output/playwright/sch-10-planner/**`

### 验收措辞（强制）
- ✅ 允许写：**PASS simulated standalone CSS gate (SCH-10A)**
- ❌ 禁止写：**PASS iOS PWA** / **SCH-10 closed**

### 验收
- [ ] viewport · standalone class · 时间戳
- [ ] `overflowY` / scrollHeight 写入 report
- [ ] 仅 evidence — 不 claim 已修复

---

## 任务 B（待命）：Finance F-P6 baseline

**阻塞：** Ken 提供 isolated QA storage state（`apps/finance/docs/FP6_QA_AUTH.md`）

    cd apps/finance && npm run qa:fp6:bootstrap
    node scripts/fp6-baseline-qa.mjs

- 仅 pre-mutation · **F-P6a impl BLOCKED**
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

### 7.9 Fable 后置 — Slice 2 IA / F-P6-R0

```markdown
## 任务 A：F-P6-R0 readiness review（只读 · 非 F-P6a impl）

**条件：** P-SCHED-0 已关闭 · 数据 foundation + QA runtime 就绪

### 必读
- `apps/finance/docs/FP6_PURCHASE_REVIEW.md`
- `apps/finance/docs/FP6_PURCHASE_REVIEW_DATA_CONTRACT.md`

### 交付
- 只读评审：数据层 blocker 是否解除 · F-P6a 是否可授权
- **不得**实现 Confirm/Reject UI 或 JSONB mutation

---

## 任务 B：PaperOS Slice 2 IA（无真机合并）

**条件：** Slice 1.1 device PASS · **SYS-1 仍 blocked 时仅产出 IA 文档**

### 必读
- `docs/qa/paperos-eink-uiux-agent-brief.md`
- `docs/qa/paperos-next-ui-update-guide.md` Slice 2 节
- `docs/qa/paperos-eink-uiux-gap-audit.md`

### 交付
- Slice 2 导航/页面清单 · 与 brief §6 P0 对照表
- 明确标注「QML 实现等 SYS-1 verdict」
- ≤30min SYS-3 Settings 语义评审（Launch after unlock Beta Off）

### 禁止
- QML/C++ 真机合并 · 绕过 SYS-1 的 launcher 假设
```

---

## 8. Cursor / 额度 / 维护


| 意图               | 用法                          |
| ---------------- | --------------------------- |
| 设备 SSH / systemd | Codex shell                 |
| 生命周期 QML         | Cursor — **SYS-1 后**（SYS-3） |
| Fable XL         | Claude Code worktree        |



| 问题             | 答案                                             |
| -------------- | ---------------------------------------------- |
| P-MOVE-6 何时？   | **SYS-2 之后**（与 SYS-3 **可并行**）                  |
| SCH-10 何时关闭？   | **SCH-10A** simulated + **SCH-10B** Ken 真机 PWA |
| SCH-0 谁负责？     | **仅 Fable** — Cursor 不得改 migrate               |
| FT-P5 产品 gate？ | **Ken 或 Fable** — Codex 不得自行关闭                 |


**维护：** Hub §Now ↔ §0 ↔ §依赖图 · §7 Prompt 随 Hub 更新 · lifecycle `[paperos-device-lifecycle-discovery.md](../qa/paperos-device-lifecycle-discovery.md)`

**审核修订清单（2026-07-11）：** P0-1 SCH-0 归 Fable · P0-2 去除假绿 · P0-3 SCH-10A/B 拆分 · P0-4 candidate signal 预注册 · P0-5 P-MOVE-5 gate 表 · BASE_SHA · 合并顺序 · FT-P5 closure authority

**相关：** `[planner-schedule-uiux-audit.md](../qa/planner-schedule-uiux-audit.md)` · `[PRO_MOVE.md](../PRO_MOVE.md)` · `[apps/planner-pro-move.md](./apps/planner-pro-move.md)`