---
title: Life OS / Kenos — Productivity & Architecture Audit
date: 2026-07-22
commit: 23cb21e14
reviewer: evidence-based audit (repo + Supabase + deploy + tests + Apple clients + local services)
status: for external architecture & product review
scope: read-only investigation — no code/DB/deploy/migration changes were made
---

# Life OS / Kenos — Productivity & Architecture Audit (2026-07)

> Method: cross-checked implementation against docs; **implementation wins on conflict**. DB facts are live-queried from the linked Supabase project `iueozzuctstwvzbcxcyh` ("Life OS"). Row counts and last-write dates are as of 2026-07-22. Where a claim could not be verified it is marked `UNKNOWN`.

---

## 一句话结论 (≤200字)

它现在是**一个联邦制的"统一入口平台"——多个真实、日用的独立 App，藏在一个共享身份 / 事件总线 / MCP 舰队 / 深链启动器（Kenos 壳）之后——而不是一个统一操作系统**。最成熟的能力是**各领域 App 自身的真源数据栈**：Finance（5,596 笔交易）、Planner（1,853 任务，且是全端唯一 canonical task 存储）、Fitness、Music、Home 都在每日真实写入并跨端同步。最大的结构性问题是：**"行动层"是黑的**——Kenos 的生产写入默认 fail-closed（`VITE_KENOS_PROD_WRITES` 关），outbox 149 行 pending 从未被 drain，Work/Focus/Approvals/Capture 表全 0 行且靠 fixture 演示，助手只能执行极窄的写操作且不经它自己已建好的审批层。**主等级：Personal Beta**（单机日用可靠的领域 App 联邦；但作为"统一 OS"的编排 / 行动 / 统一对象层仍是 Alpha）。判断依据：真实每日写入 + 跨端同步（→ 超过 Alpha），但统一对象缺席、行动闭环未通、原生壳崩溃率高（→ 未达 Reliable Daily System）。

---

## 二、主等级判定

| 视角 | 等级 | 依据 |
|---|---|---|
| **整体统一系统（主判定）** | **Personal Beta** | 单人每日跨多领域真实使用 + 真源 + 云同步；但统一对象/编排/行动层未通，原生壳崩溃率高 |
| 独立领域 App（Finance/Planner/Fitness/Music） | Reliable Daily System | 真数据、真 CRUD、跨端同步、每日写入 |
| Kenos 统一/OS 层（Today/Work/Focus/Approvals/Capture/Assistant-act） | Personal Alpha | 读多写零、生产写入 fail-closed、outbox 不 drain、空表 |
| 原生 iOS 壳 | Personal Alpha（可靠性维度） | 真机安装成功，但 349 session / 338 crash（07-22 修复未验证） |

**它是哪一种？** 按项目自己的路线图口径：**"联邦制已通（SSO · events · MCP 舰队 · wikilink），联合制（object_ref + 有消费者的时间线）仍是前沿。"** 审计完全印证这一自评——它是**联邦 + 统一启动器**，尚非统一 OS。唯一真正"监控并操控外部系统"的 OS 式能力是 Code/Cursor bridge。

---

## 三、整体架构现状

```text
用户入口
├─ Web (9 个 Netlify 站, *.kenos.space)                              LIVE
├─ iPhone/iPad — Kenos 统一 SwiftUI 壳 (WKWebView over web apps)      LIVE(崩溃率高)
├─ macOS — Kenos SwiftUI 壳 + 每 app Tauri v2 壳(AIOS/Health/Know.)   PARTIAL
├─ watchOS — 原生 SwiftUI glances(Today/Focus/Capture)               PARTIAL(仅模拟器)
├─ 浏览器插件 — Finance Sync (Chrome MV3, 采购/持仓抓取)              LIVE
└─ Paper Pro Move (独立仓库 paperos + Planner /api/paper/*)          PARTIAL

体验层 (apps/aios = Kenos 壳, www.kenos.space)
├─ Kenos shell / Spaces 启动器 / Today                              LIVE(读) / 只读聚合
├─ Assistant / AIOS (本地 llama-swap ↔ 云 Kimi)                      LIVE(执行面窄)
├─ Capture / Inbox                                                  PARTIAL(2 行, flag-dark)
├─ Search (本地 Vault RAG / memory 语义召回)                         LIVE(单机)
├─ Notifications (iOS 本地通知 / Live Activity / Planner push)       PARTIAL
└─ Domain Apps (深链到独立部署, 非内嵌)                              LIVE

Domain 层
├─ Plan (Planner)      LIVE  ├─ Knowledge (native Vault)  LIVE(单机)
├─ Finance             LIVE  ├─ Fitness (Training)        LIVE
├─ Health (Focus 代理) LIVE(单机) ├─ Home (spatial)        LIVE
├─ Music               LIVE  ├─ Code (Cursor bridge)      LIVE(LAN)
├─ Work                MOCK  └─ Paper                      PARTIAL

共享平台层
├─ Auth (@life-os/sync 共享 JWT, RLS)                    LIVE
├─ Entity / 统一对象 (object_ref)                        PLANNED
├─ Action / Command (kenos_*_action RPC)                 PARTIAL(prod fail-closed)
├─ Activity (life_events 总线 + kenos_plan_activity)     PARTIAL(仅 2 类事件流)
├─ Approval (kenos_action_approvals)                     MOCK(0 行, 未接助手)
├─ Connector (Jira/GitHub/Figma…)                        PLANNED(仅 fixture)
├─ Search / Retrieval (本地 RAG)                         LIVE(单机)
├─ Automation / Scheduler (launchd / outbox worker)      PARTIAL(outbox 无 drainer)
├─ Notifications                                         PARTIAL
└─ Sync / Offline (LWW + 墓碑 + 离线队列)                LIVE

数据与执行层
├─ Supabase / Postgres (RLS, 0 edge functions)           LIVE
├─ Local AI (llama-swap 127.0.0.1:18888)                 LIVE(单 Mac SPOF)
├─ Local files / Vault (.md)                             LIVE(单机)
├─ Browser-derived data (web-state-bridge, 兄弟仓)        PARTIAL
├─ Apple platform data (HealthKit)                       PARTIAL(设备门)
├─ Third-party APIs (Kimi/Moonshot, MusicBrainz)         LIVE
└─ Background workers (Netlify fns; 无 Supabase edge)     PARTIAL
```

**长期写入权归属：** 各领域 App 在**自己的 schema/部署**里独占写入权（planner_tasks、finance_*、fitness.*、music.*、home.*、aios.memories）。Kenos 壳几乎不写生产数据——只写 `aios.shell_state`（偏好，1 行）、`aios.code_bridge_endpoints`（配对，0 行）、`kenos_capture_envelopes`（2 行）。

**同一对象多处写入：** 基本没有——这是好现象。唯二可注意：(1) Finance 采购标注**双写** `finance_transactions` 行 + `purchase_associations`；(2) 壳/resume 状态双作者（localStorage + 云 LWW），已对账。存在的是**迁移期影子读模型**（`buildTodayReadModel` vs `buildLegacyTodayShadowProjection` + `shadowLegacyFixtures`），是 cutover 脚手架而非分叉真源。

**旧路径并行：** DB `app_registry`(7 app) ≠ theme `appRegistry.js`(9 origin) ≠ Kenos `spacesList`(11 space) —— **三套注册表部分漂移**。`buildLegacyExternalSpaces` 保留但空。

**本机 / LAN / 云 / 离线 / SPOF：**
- **只能本机：** 本地 AI（图像/VLM/Vault RAG/TTS）、Health Focus 代理、Cursor bridge、Home 视觉批处理。
- **依赖 LAN：** 手机连 Mac 的 `/__localai` 与 `kens-mac.local:5273`。
- **依赖云：** 所有领域数据（Supabase）、助手云回退（Kimi）。
- **可离线：** 各 web app 的本地状态 + 离线队列 + Music 本地音频 blob。
- **单点故障：** **Ken 的 Mac** 是整个"智能层"的 SPOF；Supabase 是数据 SPOF。

---

## 四、统一对象与跨 Domain 契约

**结论：统一对象是文档级的，不是运行级的。** 存在一个 `packages/contracts` zod 契约层（`kenos.ts` 定义 16 个 domain 枚举、安全域、分类）和一个真实但极窄的 `life_events` 事件总线（`packages/contracts/src/events.ts` 判别联合）。但**唯二真正在总线上流动的事件**是 `fitness.workout_logged`（37 processed）和 `finance.bill_due`（17 processed）——都由 Postgres 触发器产生、被 Planner 的 `lifeEventsInbox.js` 消费。`core.task_captured` 契约已定义但总线上 0 事件。**没有 `object_ref` 统一实体引用**（路线图明确列为未做前沿）。

| 对象 | Canonical owner | 存储位置 | 写入入口 | 读取方 | 重复模型 | ID 统一 | 状态 |
|---|---|---|---|---|---|---|---|
| Person/Identity | Auth | `auth.users`(3) / `core_profiles`(3) | Supabase Auth | 全 app | 无 | ✅ JWT | LIVE |
| Space | Kenos 壳 | `spacesList`(代码) + `aios.shell_state` | 壳 | Today/Spaces | 三套注册表漂移 | 部分 | PARTIAL |
| Project | 各域各自 | `planner_projects`(54) / `kenos_work_projects`(0) / `home` | 各域 | 各域 | ⚠️ Plan≠Work≠Knowledge | ❌ 无统一 | PARTIAL |
| Goal | Finance | `finance_goals`(0) | repo(已建) | forecast | — | — | MOCK(0 行) |
| Task | **Planner** | `planner_tasks`(1853) | repo + `kenos_*_plan_task_action` RPC | Planner/Today/助手/Apple | **无——单一真源** | ✅ 同 id 全端 | **LIVE** |
| Event(日历) | Planner | `planner_tasks`(scheduled) | Planner | Planner/Today | 无 | ✅ | LIVE |
| Note/Knowledge | Knowledge(Vault) | `.md` 文件(单机) | Vault(Tauri) / localStorage(web) | Knowledge/助手 | ⚠️ web≠native 两岛 | 文件路径 | PARTIAL |
| Document | — | — | — | — | 无 owner | ❌ | PLANNED |
| Transaction | Finance | `finance_transactions`(5596) | repo + 插件 | Finance/MCP | 无 | ✅ | LIVE |
| Health Metric | Health | 本地文件(`~/Library/.../HealthOS`) | Focus 代理 / HealthKit | Health/Kenos Today | 无 | 本地 | PARTIAL(单机) |
| Home Object | Home | `home.object_observations`(309) | 扫描 + 离线 matcher | Home/MCP where_is | 本地编辑器 vs 云镜像 | ✅ | LIVE |
| Media Item | Music | `music_track_meta`(269) + Storage blob | 导入 | Music | 无 | ✅ | LIVE |
| Capture | Kenos | `kenos_capture_envelopes`(2) | captureWriters(flag-dark) | /inbox | ⚠️ 与 life_events inbox 并行 | UUID | MOCK |
| Activity | Kenos/各域 | `life_events`(54) + `kenos_plan_activity`(156) | 触发器 + RPC | Today/Activity | 两条 activity 流 | 部分 | PARTIAL |
| Notification | 各端 | iOS 本地 / `planner_push_*`(0) | 各端 | 各端 | 无统一策略 | ❌ | PARTIAL |
| Approval | Kenos | `kenos_action_approvals`(0) | request/decide RPC(gated) | /approvals | 无 | UUID | MOCK |
| Automation | — | launchd(仓外) / outbox(无 drainer) | — | — | 无统一 | ❌ | PARTIAL |
| Connector | — | fixture(Jira PROJ-12 硬编码) | — | Work(演示) | — | ❌ | PLANNED |
| Conversation | AIOS | `aios.conversations`(19) + localStorage | 助手 | 助手 | 云+本地(LWW) | ✅ | LIVE |

**六个特检问题的答案：**
1. **一个 Project 能否关联任务/日历/笔记/文档/费用/活动？** ❌ 否。Planner project 只关联任务。Work project（另一模型，0 行）在 fixture 里关联 Jira/library refs，但不落库。无跨域 project 聚合。
2. **同一任务在 Planner/Today/Assistant/Apple 是否同 id 同态？** ✅ **是**——`planner_tasks` 单一真源，`newTaskId` 一次生成全端复用，Apple 端是同一 web app 的 WKWebView，MCP 写入按"另一台设备"回并。这是全系统**最强的统一点**。
3. **Capture 进系统后能否可靠分类/转换/追踪/关闭？** ⚠️ 契约完整但**未开灯**——2 行、triple-flag 门控、无自动分类步骤、需人工点转换。
4. **Activity 来自真实事件还是前端拼装？** ✅ 真实——`life_events` 由 DB 触发器写、`kenos_plan_activity` 由 RPC 事务内写。但只有 2 类事件真流动。
5. **助手操作是否经统一 Command/Action 层？** ⚠️ 部分——写操作走 `kenos_*_action` RPC（真 Command 层），但助手内建工具（`executeTool`）**绕过审批层直接调用**，安全靠 env-flag deny-list 而非 per-action approval。
6. **是否有真正的幂等/重试/失败恢复/审计？** ✅ 幂等强（3 个唯一约束，同 key 异 payload 拒绝）、审计真（activity 表含 redacted payload + correlationId）。❌ **重试/投递无 worker**（outbox 列有 attempts/next_attempt_at 但无消费者）。

---

## 五、逐个 Domain 审计

> 评分 0–5：0 不存在 / 1 概念 / 2 可演示 / 3 核心可真用 / 4 稳定个人 Beta / 5 完整可靠可依赖。

### Finance（money）— finance.kenos.space

**1. 职责/边界：** 决策向个人财务座舱（现金/投影/边际支出）。拥有账户/交易/持仓/现金流/采购标注/对账。向上只暴露只读摘要（portal summary + MCP `month_summary`/`liquid_cash`）。无 object_ref。
**2. 能力：** 单一 web app，iOS/macOS 为同站 WKWebView。全平台一致、云同步。余额**手动快照**（不由交易静默重建，设计如此）。演示数据仅 localhost。插件采购捕获链路 robust（队列/DLQ/去重，`MAX_DELIVERY_ATTEMPTS=8`）。
**3. 数据/实现：** 引擎为纯函数（`packages/finance-core`，38 测试）。**采购链路**：Chrome MV3 插件抓 Robinhood/Amazon 等 → 页面 postMessage → `ExtensionSyncBridge` 按日期/金额匹配 → 双写 txn 行 + `purchase_associations`。AI：`ai-brief`（Kimi）只出叙事简报；MCP 只读。
**⚠️ 建好但 0 行（UI 完整却无采纳）：** Decision Studio（`finance_decision_records`/`finance_scenarios`=0）、Goals（0）、Review 队列（`finance_review_items`=0，**无生产者**——成功 UI 写不进任何东西）。死表：`finance_recurring_items`/`finance_data`/`finance_merchant_rules`=0。

| 维度 | 分 | 证据 |
|---|--:|---|
| UI 完整度 | 5 | 9 路由/图表/i18n |
| 核心 CRUD | 3 | 账户/交易/持仓真；决策/目标/审阅 CRUD 建好但 0 行 |
| 数据真实性 | 4 | 5596 真交易(07-21)；规划层无真数据 |
| 数据一致性 | 3 | 采购双写；遗留 `finance_data` |
| 跨端同步 | 4 | RLS 关系表 per-user |
| 跨域联动 | 3 | 只 portal + MCP 只读 |
| 自动化 | 4 | 插件捕获→匹配→标注 + reality-loop + 日 dedupe launchd |
| AI 可执行 | **2** | MCP 只读，不能建交易/确认采购 |
| 可靠性 | 4 | DLQ/去重/原子恢复/版本冲突 RPC |
| 日常价值 | 4 | 交易日更；采购审阅用到 07-18 |

**最短木板：AI 可执行(2)** + 整个规划层惰性。**P0** 给 `finance_review_items` 接生产者或撤掉该 Tab。**P1** 决定 Decision/Goals/Scenarios 去留；加 MCP 写动作。**定位：保留为独立 App / Kenos money 模块**（负载承重域，非冻结候选）；冻结规划层。

### Planner（plan）+ Kenos Plan 核心闭环 — planner.kenos.space

**1. 职责：** 成熟独立任务管理器，**canonical task 真源**。Plan/Work 边界硬隔离（`kenos_create_plan_task_action` 拒 `producer='work'`）。
**2. 能力：** Web 全 CRUD（LWW 整行 upsert + 30 天墓碑）。iOS/mac/watch 皆 `embeddedWeb`（无原生任务 CRUD）。MCP `add_task`/`complete_task` 走 hosted RPC。**Canonical task = 已验证**（全端同 id 同态）。
**3. 核心闭环：** `kenos_*_plan_task_action` 为单原子 SECURITY DEFINER（idempotency→planner_tasks→outbox(pending)→activity(succeeded) 一事务）。**幂等强**（3 唯一约束，异 payload 拒）。**审计真**（activity 156 行，redacted payload + correlationId）。**⚠️ outbox 从不 drain**——无 worker，149 pending + 1 dead_letter，0 processed；`capabilityRegistry` 标 `outbox.delivery=unavailable`。
**空表三因：** approvals/focus_contexts(0)=已建已接但生产 gate 关；deferred_items/proactive_suggestions(0)=**纯死脚手架**（无 writer RPC、无 caller）。
**⚠️ F5 QA 报告"closed/READY"高估**：writers 默认 fail-closed、outbox 悬空、29 commit 本地未 push、156 activity 多为 clean-room/MCP 而非应用内助手。

| 维度 | 分 | 证据 |
|---|--:|---|
| UI 完整度 | 4 | 13 路由 |
| 核心 CRUD | 4 | ~15 command RPC + web repo |
| 数据真实性 | 5 | 1853 任务(今日写) |
| 数据一致性 | 4 | 单一真源 + LWW |
| 跨端同步 | 4 | 全端同 id；native 皆 WebView |
| 跨域联动 | 3 | life_events 消费 fitness/finance |
| 自动化 | 2 | **outbox 无 drainer** |
| AI 可执行 | 3 | MCP 真写 add/complete |
| 可靠性 | 3 | 幂等/dead-letter 真；自动重试缺 |
| 日常价值 | 5 | 今日写入 |

**最短木板：治理脚手架(1)**（4 表死重，2 表不可达）+ 自动化(2)。**P0** 上 outbox worker 或删 outbox；解决 writer gate（否则别称 F5 "ready"）。**P1** 删/接 deferred/proactive；原生任务面。**定位：canonical Plan 存储**；Kenos 治理闭环"写与投递两半皆黑"，要么点亮要么降范围。

### Fitness（training）— fitness.kenos.space

**1. 职责：** 4 日轮训计划 + 逐组记录 + 进阶/减载 + 准备度自调。
**2. 能力：** Web/PWA 全 CRUD，真 localStorage⇄Supabase 双向 LWW。iOS/mac/watch 共享 Kenos 壳同 bundle，**无原生健身 UI / 无原生 Watch 记录**。真数据（46 session 今日写、243 log）。5 表 RLS + 注册触发。
**3. 实现：** MCP 真但**只读**（`today_training`/`recent_sessions`/`readiness_hint`）。AI 为**确定性启发式**（非 LLM）。**Qwen-Edit 姿势迁移 demo 管线未接入 app**（离线资产生成工具）。

| 维度 | 分 |
|---|--:|
| UI/CRUD/数据真实 | 4/5/5 |
| 一致性/同步/跨域 | 4/4/3 |
| 自动化/AI 可执行 | 3/4 |
| 可靠性/日常价值 | 3/5 |

**最短木板：可靠性(3)**（MCP 只读，AI 记不了一组；node 单测 `$lib` 别名破）。**P1** 加写 MCP（记录/完成）；修单测。**定位：成熟生产域**，从"报告"升"可执行"。

### Health — health.kenos.space（experimental, production:false）

**1. 职责：** 6 维状态引擎 + **vibe-coding 防沉迷 Focus 守卫**。明确非医疗（`medicalDecision:false`）。
**2. 能力：** **macOS 为主** = Tauri 壳 + **launchd Focus 代理（真在跑，PID 实测，KeepAlive）**。路由是薄客户端，轮询 `127.0.0.1:5193`。iOS/watch companion 仅模拟器验证，**真机 HealthKit 授权未发**。
**3. 实现：** **无 Supabase、无 `health.*` schema**（已确认）——存本地文件 `~/Library/Application Support/HealthOS/`。无 LLM。

| 维度 | 分 |
|---|--:|
| UI/CRUD/数据真实 | 3/2/4 |
| 一致性/**同步**/跨域 | 3/**1**/3 |
| 自动化/AI 可执行 | 5/2 |
| 可靠性/日常价值 | 4/4 |

**最短木板：跨端同步(1)**（无云，数据困在一台 Mac）。**P1** 发真机 HealthKit（entitlement 有 bug）。**定位：真实但单机/实验域**——诚实命名为"Focus & State"直到 HealthKit + 云同步落地。

### Music — music.kenos.space

**1. 职责：** 个人本地音乐播放器 + 库 + 标签 + 推荐（非流媒体）。
**2. 能力：** Web PWA + iOS Capacitor（`capacitor-nowplaying` 锁屏）。**无 macOS**。音频**混合**：本地 IndexedDB blob + 私有 Supabase Storage `music` 桶（TUS + 签名 URL）。**Playlists(0 行)=建好未用**（liked 是事实歌单）。**推荐(404 事件)=真且已接**（Postgres RPC `music.get_recommendations` 在线学习，自动电台消费）。
**3. 实现：** 3 层标签（客户端启发式 2520 tag + 可选 LLM enrich）。⚠️ **`/api/import/enrich` 端点在 `apps/music` 找不到**（LLM 标签在 prod 静默 no-op）。`track_embeddings=0`（未建）。

| 维度 | 分 |
|---|--:|
| UI/CRUD/数据真实 | 5/5/5 |
| 同步/失败UX/AI | 4/4/3 |
| 跨平台/prod接线/日常 | 3/4/4 |

**最短木板：AI/ML(3)**（enrich 端点缺、embedding 0）。**P0** 解决 `/api/import/enrich`。**P1** 填或删 `track_embeddings`。**定位：以"你的文件 + 口味学习播放器"发布**，主打自动电台而非歌单。

### Home — home.kenos.space（experimental）

**1. 职责：** 空间家模型：扫描→户型（/plan）、收纳（/storage）、整理（/tidy）。本地编辑器为真源。
**2. 能力：** Web PWA + **独立 RoomPlan iOS 扫描器**（`ios/home-scan`）。**无 macOS app**（"Mac 侧"是 Python 批处理）。`/plan` 全几何编辑器；`/tidy` 真（89 event 行）。**storage_snapshots(0)=建好未用镜像**。**物件认亲=生产读、离线算**——DINOv2 embedding（560 行）+ 匈牙利匹配由**手动 `--apply` 批处理**写，非生产。VLM 场景理解仅 dev/LAN。
**3.** 6 迁移；本地↔云多镜像（分叉风险，见 canonical-versioning）。

| 维度 | 分 |
|---|--:|
| 产品/能力/CRUD | 4/4/4 |
| 同步/失败UX/数据模型 | 3/3/5 |
| AI-ML/跨平台/**prod接线** | 3/3/**2** |

**最短木板：prod 接线(2)**（认亲/VLM 是离线研究管线）。**P0** 自动化 embedding/matcher（现手动）。**定位：以"扫描驱动整理教练"叙事**；认亲/VLM 先服务器化再对外。

### Knowledge（library）— knowledge.kenos.space（本地优先）

**1. 职责：** Notion 式块编辑器 over 本地 `.md` Vault（取代 Obsidian）。
**2. 能力：** **三模态存储**：native macOS(Tauri) 读写 `~/「Projects」/Vault`（真 CRUD，437+ 文件）；web 退化到 localStorage（**与 Vault 是两座孤岛**）；云只读 Planner 联动。**无 `knowledge.*` schema**。
**3. 实现：** 手写编辑器。**RAG 为外部本地服务**（`vault_server.py`，BM25+向量+RRF+rerank，90s 增量索引）——**真"胜过 Obsidian"的差异点**，数据不出机。

| 维度 | 分 |
|---|--:|
| 真实/CRUD/**同步** | 4/4/**1** |
| 恢复/RAG/AI | 3/5/4 |
| 跨平台/数据模型/隐私 | 2/4/5 |

**最短木板：同步(1)**（native Vault 与 web localStorage 不通）。**P0** 统一笔记持久化。**定位：真实私有文件原生知识库 + 强本地 RAG**，当前构造上单机。

### AIOS Assistant / Memory — www.kenos.space

**1. 职责：** 对话助手 + 持久记忆 + 跨域 agentic 工具循环。
**2. 推理位置：** **双后端**——本地 llama-swap（`127.0.0.1:18888`，OpenAI 兼容，embedding + 补全）+ 云 **Kimi/Moonshot**（`kimi-k2.5/2.6`，非 Claude/GPT）。embedding/记忆抽取永远本地。
**3. 可执行工具清单（真 tool_calls）：** `get_time, calculate, run_javascript, save_memory, search_memory, fetch_url, web_search, search_notes/read_note/ask_notes, generate_image, life_os_today, finance_summary, planner_tasks, planner_add_task, focus_status/start_focus/end_focus, open_space, compose_library_note` + 浏览器工具；**仅 native(Tauri)：** `delegate_task, read/search_cursor_sessions, run_applescript, ai_app_send/read, open_mac_app, type_into_app, look_at_screen, github_cli`。**真写能力极窄**：`save_memory`(→memories)、`planner_add_task`(→life_events 事件, 非直写)、`generate_image`(本地 mflux)、Mac-only GUI 委派。**其余皆读/导航。**
**⚠️ 审批层未接入助手**：`kenos_action_approvals` + `/approvals` 全套存在，但 `executeTool` **ad-hoc 直调**，无预执行审批门；唯一护栏是 env-flag deny-list（fail-closed）。
**记忆(223 行)：** 每轮 `autoExtractMemories` 自动抽取（≤2/轮，0.92 语义去重）+ 夜间 `dreamMemories`；localStorage(≤200) LWW 同步到云 + 墓碑。

| 维度 | 分 |
|---|--:|
| 真实/工具执行广度/**写安全** | 4/3/**2** |
| 记忆/对话持久/推理架构 | 4/4/4 |
| **审批集成**/跨平台/隐私 | **1**/3/4 |

**最短木板：审批集成(1)**。**P0** 让写工具经审批层再执行。**定位：可用的本地优先 agent + 强自动记忆**，但其审批/命令脚手架建好未用——今天它比自己架构意图更直接地行动。

### Capture & Inbox

**结论：脚手架，largely dark。** 2 行（07-20）。每个 writer **triple-flag 门控**（默认关则 no-op）。契约良好（`buildCaptureIngestAction`/`buildCaptureConvertAction`，risk R1，幂等 UUID），但**闭环由 flag 关闭而非用户关闭**；无自动分类步骤；助手不自动捕获（`producer:'assistant'` 路径未用）；与 `life_events` 任务捕获 inbox **两条并行**。

| 维度 | 分 |
|---|--:|
| 真实/闭环/CRUD | 2/2/3 |
| 采纳/契约质量/转Plan | 1/4/2 |
| 幂等/跨面/无静默/内聚 | 4/2/5/3 |

**最短木板：采纳(1)**。**定位：谨慎契约化、安全优先的捕获脊柱，建好未开灯**——"统一生产力系统"叙事里最弱一环。

### Work — Kenos 原生路由 /work

**MOCK/脚手架，不能真用。** 全 `kenos_work_*`=0 行；`isProdWorkReadEnabled` 默认关。UI 由 `workStore.svelte.js`（自述"Phase 3 simulation. Not a production writer."）喂，真内容仅 `?kenosDemo=1` → 硬编码 fixture（"Kenos Phase 3"、Jira PROJ-12、UUID `a1000000-…`）。

| 维度 | 分：数据1/写1/编排2/prod-on 1/OS性 2 |
|---|---|

**定位：合并进统一 Project 模型**（详见第六节 F）。

### Code — Kenos 原生路由 /code

**真——唯一真正的控制面集成。** `agent/cursor-bridge.mjs`（**未追踪**）是工作中的 LAN 守护：只读打开 Cursor SQLite（`state.vscdb` ~27GB，`mode=ro` WAL 安全）并经 AppleScript 注入（⌘L→粘贴→回车，剪贴板保存/恢复）——真 GUI 操控。双鉴权（配对 token / owner-JWT）、SQL 注入护栏、CORS 白名单、loopback 门。三模式（native/remote/demo），配对经 `aios.code_bridge_endpoints`（RLS owner-only，0 行=未配对，对话内容不出 LAN）。

| 维度 | 分：数据8/写8/编排7/prod-on 6/OS性 8 |
|---|---|

**定位：保留——OS 抱负的可行性证明**；但把守护进程纳入 git（现未追踪=不可复现/不可审）。

---

## 六、生产力系统闭环审计

| 环节 | 当前入口 | 当前能力 | 数据 owner | 跨域联动 | 自动化 | 主要断点 |
|---|---|---|---|---|---|---|
| 输入(捕获) | Today→QuickCapture / 助手 | 文字；语音/截图未见 | Kenos capture(2 行) | 弱 | 无 | flag-dark，2 行 |
| 理解 | 助手(Kimi/本地) | 对话理解 | — | — | 每轮 | 不落 capture |
| 分类 | — | **无自动分类步骤** | — | — | 无 | ingest→convert 间空档 |
| 决策 | 人工 | — | — | — | 无 | 无提案引擎 |
| 规划 | Planner 手动 | 手动建任务/项目 | planner_tasks | life_events | 无 | 无自动拆解 |
| 排程 | Planner /schedule | 手动排期 | planner_tasks | — | 无 | 无智能排程 |
| 执行 | Planner / 助手 add_task | 真写(hosted RPC) | planner_tasks | — | **outbox 不 drain** | 无自主执行器 |
| 专注 | /focus + 设备本地 | 设备本地 session | focus(0 行) | Health Focus 代理 | Health launchd | 无跨端持久 |
| 协作 | — | **无** | — | — | 无 | 无 stakeholder/多人 |
| 追踪 | Activity / Today | 真读 life_events | life_events(54) | 2 类事件 | 触发器 | 只 2 类流动 |
| 复盘 | Knowledge overview / Finance | 静态分析 | 各域 | 无 | 无 | 无统一周复盘 |
| 学习 | 记忆自动抽取 | 223 记忆 | aios.memories | 无 | 每轮+夜间 | 不驱动规划 |
| 自动优化 | — | **无** | — | — | 无 | 无闭环优化 |

### 场景 A：快速捕获 — ⚠️ 未通
统一 Inbox 存在但 flag-dark（2 行）；保留来源（envelope 有 producer/source）；**不自动识别人/项目/日期/优先级**（无分类步骤）；能转任务但需人工点；无重复处理自动化。**助手说"加个待办"→ 走 `planner_add_task`→life_events→Planner 消费**（这条通，54 事件为证），但**不进 capture envelope**——两条捕获路径并行。

### 场景 B：项目推进 — ❌ 大缺口
无法从目标自动建 Project + 拆 milestone/task。Planner project 是手动容器（54 行，仅关联任务）。Work project（能拆、能关联资料）是 fixture，0 行。**无"下一步/阻塞/等待/风险"识别，无按变化重规划，无决策历史**（`kenos_work_decisions`=0）。

### 场景 C：每日工作台（Today）— ⚠️ 只读聚合，非编排层
**是真实跨域读**（`portal_today_summary` RPC + 真 `life_events`/`planner_tasks`/approvals RPC），**不是前端假数据**。但**头注释明言"stays read-only：每个卡片指回其域 owner"**——是**深链聚合**而非编排。`prodReadFlagSnapshot` 硬编码所有写为 false，Kenos 跨域 overlay 默认**关**（prod 上 Today 就是 legacy portal summary）。**不回答"系统已自动完成了什么"**（除 activity 回显）；用户完成后其他域**不联动更新**（无 object_ref）。

### 场景 D：深度工作 — ⚠️ 部分（分裂）
可选目标 + 设备本地 Focus session（真 `focusStore`）；Health launchd 代理**真屏蔽干扰**（全屏强制休息，实测在跑）。但**跨端 focus 持久=关**（`focus_contexts`=0，`focusWrite=false`）；结束不自动生成 activity/更新任务/生成下一步。两套 focus（Kenos /focus 与 Health 代理）**未统一**。

### 场景 E：助手执行 — ⚠️ 窄且不经审批
能理解目标、检索上下文（记忆召回 + 笔记 RAG）、真调 `planner_add_task`。但：**无可审阅计划提案**、**不经 Approval**（ad-hoc 直调）、**无多步失败重试/回滚/补偿**（outbox 不 drain）、汇报靠对话。**真可执行 Action 清单（非规划）：** `save_memory`、`planner_add_task`（→life_events）、`complete_task`（MCP）、`generate_image`、`open_space`/深链、`start/end_focus`（设备本地）、`compose_library_note`（深链），Mac-only：`run_applescript`/`type_into_app`/`delegate_task`/`ai_app_send`/Cursor 操控。**其余 40+ 工具皆读/导航。**

### 场景 F：工作生产力 — ❌ 最大空白
| 能力 | 现状 owner | 缺口 |
|---|---|---|
| Workspaces/Projects | Work(0 行 fixture) | 无真 owner |
| Stakeholders | 无 | 缺 |
| Meeting prep/notes | `kenos_work_meetings`(0) | fixture |
| Decisions/Action items | `kenos_work_decisions`(0) | fixture |
| Follow-ups | 无 | 缺 |
| Research/Docs | Knowledge(单机 Vault) | 无 owner 归集 |
| Figma/GitHub/Email/Calendar | 无连接器(fixture) | PLANNED |
| Browser research | web-state-bridge(兄弟仓) | LAN/单机 |
| Status updates/Weekly review | 无 | 缺 |
| Career/impact log | 无 | 缺 |

**判断：职业工作场景目前无明确 owner，散落在 Work(mock)/Knowledge/Assistant/浏览器插件之间。** 建议：**不新建独立 Work Domain，而由"统一 Project 模型 + Connector 层 + object_ref"承载**（当前 Work 表已是这个雏形，但从 0 起且未接真连接器）。

---

## 七、入口与信息架构

| 平台 | 顶层入口 | 二级 | 能力 | 重复 | 符合统一心智 |
|---|---|---|---|---|---|
| Web | 9 个 *.kenos.space 独立站 | 各站自有导航 | 全域 | ⚠️ 每站独立 | 部分(联邦) |
| Kenos 壳(www) | Spaces Orb + Today·Ask·Inbox | /work /code /focus /approvals /activity /spaces | 聚合+启动 | ⚠️ 见下 | 是(壳内) |
| iOS | Kenos 统一壳(dock/shelf) | 12 domain(WebView) | 全域 | 与 web 同 | 是 |
| macOS | Kenos 壳 + 3 个 Tauri app | — | AIOS/Health/Know. | ⚠️ 两套原生轨 | 部分 |
| watchOS | 原生 glances | Today/Focus/Capture/Inbox | 只读+草稿 | 无 | 是(仅模拟器) |
| 浏览器 | Finance Sync 插件 | — | 采购/持仓抓取 | 无 | 是(专用) |

**重点判断：**
- **多个"回到工作"入口：** ⚠️ 是——Continue sheet / Switch sheet / Today 动态 spaces / /spaces shelf / /work 五个门通向相似目标；`spaceSwitcher.svelte.js` 导出 4 个重叠 sheet opener。
- **多个 Space 切换器：** ⚠️ 是（同上）。
- **暴露内部技术架构：** 部分——`/uiux-direction`、`/uiux-states`、影子对比在 dev 可见；生产用户不见。
- **像 App launcher：** ⚠️ **是**——域以深链开独立部署，Today 是只读聚合。这是当前最贴切的心智模型。
- **被迫跨 App 搬运上下文：** 是——离开 Kenos 进域是整源切换，continuity 靠 resume store（书签级记忆，非上下文携带）。

---

## 八、数据真实性和上线程度

| 页面/流程 | 分类 | 数据来源 | 写真实 | 入口 |
|---|---|---|---|---|
| Finance 交易/账户/持仓 | **Real** | Supabase | ✅ | finance.kenos.space |
| Finance Decision/Goals/Review | **Mock**(0 行) | repo 建好无数据 | UI 写不进 | 同上 |
| Planner 任务/项目/日程 | **Real** | planner_tasks(1853) | ✅ | planner.kenos.space |
| Kenos Today | **Partial** | portal summary + life_events | 只读 | www.kenos.space |
| Kenos Work | **Mock** | fixture(0 行) | ❌ | /work |
| Kenos Code | **Real** | Cursor SQLite(LAN) | 真操控 | /code |
| Kenos Capture/Inbox | **Partial** | 2 行, flag-dark | 门控关则 no-op | /inbox |
| Kenos Approvals/Focus | **Mock** | 0 行, gate 关 | ❌ | /approvals /focus |
| Fitness | **Real** | fitness.*(46) | ✅ | fitness.kenos.space |
| Music | **Real** | music.*(269) | ✅ | music.kenos.space |
| Home plan/tidy | **Real** | home.*(32/89) | ✅ | home.kenos.space |
| Home 认亲/VLM | **Partial** | 离线批处理 | 手动 --apply | /settings |
| Knowledge | **Real**(native) | .md Vault | ✅(单机) | Tauri app |
| Assistant/Memory | **Real** | aios.*(19/223) | ✅ | www.kenos.space |
| Health | **Real**(单机) | 本地文件 | ✅(Mac) | Tauri app |

**逐项核查：** Mock 数据✅仅 fixture(Work)；demo-only✅严格 localhost 门控（`?demo=1`，绝不上生产）；fallback 静态❌基本无；localStorage 临时✅各域本地状态（有云同步）；hardcoded userID⚠️ Work fixture UUID + workStore knowledge 深链；dev URL/LAN⚠️ 仅 native/dev（`127.0.0.1:18888` 走 `/upstream/*` 代理，i18n 串）；未应用 migration UNKNOWN（activity 覆盖索引列为 owner gate）；未启 RLS❌基本全启；未部署服务⚠️ outbox worker/ProductionExecutor 不存在；**UI 显示成功但后台未写：⚠️ 是——Finance Review 队列、Kenos writers 在 fail-closed 下**；跨域数据前端拼装❌基本是真读（portal summary RPC）。

---

## 九、AI、自动化与通知

### AI 能力
| 能力 | 模型 | 位置 | 输入 | 输出 | 写? | 审批? | 可靠性 |
|---|---|---|---|---|---|---|---|
| Chat | Kimi k2.5/2.6 云 / 本地 llama-swap | 混合 | 对话 | 文本+tool_calls | 窄 | ❌ | 中 |
| 记忆抽取/召回 | 本地 Qwen3 embed | 本地 | 对话 | memories | ✅ | 否 | 高 |
| RAG(Vault) | vault_server BM25+向量+rerank | 本地 | 查询 | 片段 | ❌ | — | 高(单机) |
| 财务简报 | Kimi | 云 | 交易 | 叙事 | ❌ | — | 中 |
| 任务分解/规划 | — | — | — | **无** | — | — | 无 |
| Music 标签 | 启发式 + 可选 LLM | 本地/脚本 | 音频元数据 | tags | ✅ | — | 中(enrich 端点缺) |
| Home VLM 场景理解 | qwen3-vl-8b | 本地/LAN | 图 | 描述 | dev-only | — | dev |
| Home 物件认亲 | DINOv2 | 本地批 | 图 | embedding+匹配 | 手动 --apply | 人工复核 | 中 |
| 图像生成 | mflux 三档 | 本地 | prompt | 图 | ✅ | 否 | 中 |
| Fitness 准备度 | 确定性启发式(非 LLM) | 本地 | 训练史 | 建议 | 否 | — | 高 |
| 健康解读 | 状态引擎(非 LLM) | 本地 | HealthKit/事件 | 状态 | 本地 | — | 中 |

### 自动化
| 任务 | 类型 | 触发 | 读 | 写 | 失败 | 可重复? | 日志 | 静默损坏风险 |
|---|---|---|---|---|---|---|---|---|
| finance-dedupe-mirrors | launchd 03:30 | 定时+唤醒补 | finance 行 | exclude_reason(不删) | 日志 | 有 sentinel | ✅ | 低(最 robust) |
| healthos-focus | launchd KeepAlive | 常驻 | 屏幕/inbox | 本地文件 | KeepAlive 重启 | 幂等 | http.log | 低 |
| homeos vision-refine | launchd 900s | 定时+登录 | 扫描图 | object_* | — | 是 | — | ⚠️ 绝对路径,移仓即断 |
| cursor-bridge | 手动守护(未追踪) | 手动 | Cursor SQLite | 无(只读+注入) | — | — | — | ⚠️ 未追踪不可审 |
| kenos_plan_outbox | **无 worker** | — | — | — | — | — | — | ⚠️ 149 行永不 drain |
| life_events 触发器 | Postgres trigger | insert card_bill | expected_occ | life_events | 触发器 | 幂等 | — | 低(有测试) |
| Netlify fns(mcp/paper/device/ai) | serverless | HTTP | 各表 | 各表 | HTTP 码 | 是 | Netlify | 低(paper-mock gated 404) |
| Supabase edge fns | **0 个** | — | — | — | — | — | — | — |

### 通知
**无统一通知策略。** iOS 本地通知 + Live Activity（真）；`planner_push_subscriptions`=0（web push 未用）；Watch complication 缺；无统一 Inbox↔Approval↔Activity↔Reminder 去重。风险：多源可能重复提醒或漏提醒；当前量小未成负担。

---

## 十、安全、隐私、可靠性摘要

**做得好的：** RLS 几乎全表启用；AI 工具 ownership 由 JWT 派生（非模型自报）；**prompt-injection lethal-trifecta 主动缓解**（`toolEgressGuard` 拦 PII/高熵打进 URL、`guardExternalToolContent` 包裹不可信输出、`inputGuard` 扫描）；iOS WebView token 盗取已修（子串→精确/后缀，fail-closed）；日志脱敏 email/`sb_secret_*`/`sk-*`；trusted-device 用 App Attest + HMAC（`timingSafeEqual`，`hmacSecret()` fail-closed）。

**会让用户"不敢把真实工作交给系统"的问题（按信任影响排序）：**
1. **outbox 永不 drain** — 助手提案累积无执行器；写循环仅手动/owner-gated。功能最大缺口。
2. **本地-AI SPOF** — Ken 的 Mac 关机则图像/VLM/Vault/TTS/Cursor 全死，只剩云 Kimi 聊天。
3. **cursor-bridge 守护未追踪** — 真正驱动 Cursor 注入的代码不在 git，不可复现/不可审。
4. **Git 自动部署已关（`stop_builds=true` 全站）** — "什么在线上"靠手维 baseline + 共享工作树上手动 CLI，高 prod-drift 风险；`deploy-all` 在脏树上会推半成品（见 shared-worktree 记忆）。
5. **CI 漏单测/MCP 套件，fitness 测试 master 上红** — 回归可绿灯落地。
6. **原生 iOS 崩溃率高** — 349 session / 338 crash / ~331 unclean exit（07-22 前）；07-22 修复未验证后效。

**次要（accepted/owner-gated）：** `paper_device_snapshot` SECURITY DEFINER anon 可调（WARN）；`.env.staging` service-role key 明文落盘（**gitignored 未入库**，但本机风险）；`WKAppBoundDomains` 缺、导航 origin 白名单缺（owner-gated P2）；web resume 接受任意 LAN host + 已知 dev 端口（手机 beta 有意）。备份/导出/恢复/删除：各域有墓碑软删 + LWW，Vault 有目录内 git（未托管）；**无统一导出/备份/审计门户**。

---

## 十一、测试与证据

**最近成功运行：** CI（`.github/workflows/ci.yml`，HEAD `23cb21e14`，2026-07-22）跑 `validate:tokens` + 全 `build` + design-catalog（含 a11y/visual，Playwright 1.61.1）+ `check:lifeos-boundaries/styles/app-manifests` + outbox 结构检查 + **Planner desktop E2E** + **Finance IA 路由 smoke**。
**未覆盖：** `test:mcp`、`qa:mcp-fleet`、各 app 单测、`check-kenos-*` 均**不在 CI**。
**已知红/flaky/skip：** fitness `npm test` **master 上红**（`$lib` 别名破 node 纯函数测试）；`svelte-check` 漏 `no-undef`（未 import 引用过 check+build → 运行时 ReferenceError）；fitness modal-lock spec 存量红（scrollTop 差 7px）；planner E2E 会覆写 QA 证据存档（跑完必查 git status）。
**真机验证：** iOS `kenos:ios-stability:smoke` 26/26 PASS（p50 447ms）+ 真机安装日志 `INSTALL_OK launch_ec=0`（iPhone18,1）+ 349 device session 遥测。
**DB 验证：** 本审计直接 live-query（见各行计数）。
**部署验证：** ⚠️ baseline 记录 `stop_builds=true` 全站——**"deploy=push"当前为假**。
**当前 P0/P1：** F5 系列自报 `PASS_NO_KNOWN_P0_P1`（0 开放 P0/P1，2 个 P1 已修）。**但本审计新增下列 P0/P1**（见第十二/十四节）——F5 "closed" 高估，因 writers fail-closed、outbox 悬空、29 commit 本地未 push。

**每域证据索引（≥2 项）：**
- Finance：`packages/finance-core`(38 测试) · `finance_transactions`(5596) · `apps/finance/netlify/functions/mcp.mjs` · 插件 `extension/background.js`
- Planner：`planner_tasks`(1853) · `kenos_create_plan_task_action` RPC · `apps/planner/server/mcpTasks.test.mjs` · `apps/planner/src/lib/services/lifeEventsInbox.js`
- Fitness：`fitness.fitness_workout_sessions`(46) · `apps/fitness/netlify/functions/mcp.mjs` · migration `20260702185240`
- Health：launchd `com.kenpan.healthos-focus`(PID 实测) · `apps/health/agent/install.sh` · `~/Library/Application Support/HealthOS/`
- Music：`music.get_recommendations` RPC · `play_events`(244) · `packages/capacitor-nowplaying` · `cloudAudio.js`(TUS)
- Home：`home.object_embeddings`(560) · `scripts/vision/match_objects.py` · `home.scans`(32) · `recognition-review.js`
- Knowledge：`apps/knowledge/src/lib/vault.js` · `services/knowledge/vault_server.py` · `recall/+page.svelte`
- Assistant：`apps/aios/src/lib/tools.js`(executeTool) · `aios.memories`(223) · `chat.svelte.js:1386`(autoExtract)
- Kenos/Code：`apps/aios/agent/cursor-bridge.mjs` · `cursorBridge.core.test.mjs` · `aios.code_bridge_endpoints`
- Apple：`clients/apple/Apps/Shared/KenosNativeCapabilityBridge.swift` · `kenos_crash_events`(338)/`kenos_app_log_sessions`(349) · device install log

---

## 十二、最终汇总矩阵

| Domain/Platform | 产品 | 数据 | 自动化 | 跨域 | 可靠性 | 阶段 | 最大缺口 |
|---|--:|--:|--:|--:|--:|---|---|
| Finance | 5 | 4 | 4 | 3 | 4 | Reliable Daily | AI 只读；规划层 0 行 |
| Planner | 4 | 5 | 2 | 3 | 3 | Reliable Daily | outbox 不 drain；治理表死重 |
| Fitness | 4 | 5 | 3 | 3 | 3 | Reliable Daily | MCP 只读；单测红 |
| Music | 5 | 5 | 3 | 2 | 4 | Reliable Daily | enrich 端点缺；无 macOS |
| Home | 4 | 4 | 2 | 3 | 3 | Personal Beta | AI 认亲离线手动 |
| Knowledge | 4 | 4 | 3 | 2 | 3 | Personal Beta | web↔native 不同步 |
| Health | 3 | 4 | 5 | 3 | 4 | Personal Beta | 无云同步(单机) |
| Assistant/Memory | 4 | 4 | 2 | 3 | 3 | Personal Beta | 审批未接；执行面窄 |
| Capture/Inbox | 2 | 1 | 1 | 2 | 3 | Personal Alpha | flag-dark，2 行 |
| Work | 1 | 1 | 1 | 2 | 2 | Prototype | 全 fixture，0 行 |
| Code | 4 | 4 | 4 | 3 | 3 | Personal Beta | 守护未追踪 |
| Today/Shell | 3 | 3 | 2 | 3 | 3 | Personal Beta | 只读聚合非编排 |
| Apple iOS | 4 | 4 | 3 | 4 | 2 | Personal Alpha | 崩溃率高 |
| Apple mac/watch | 3 | 3 | 2 | 4 | 3 | Personal Alpha | 仅模拟器/无设备证据 |

### A. 已经可以依赖的能力
1. **Planner 任务**（全端同 id canonical，1853 行日更，跨端 LWW）。
2. **Finance 交易/持仓/采购标注**（5596 交易，插件捕获→匹配 robust）。
3. **Fitness 训练记录**（46 session 日更，跨端同步）。
4. **Music 播放/库/自动电台推荐**（真在线学习，404 事件）。
5. **AIOS 自动记忆 + 本地 RAG**（223 记忆，Vault 语义搜索）。
6. **Health Focus 防沉迷代理**（launchd 真在跑，真强制休息）。
7. **Code/Cursor 远程操控**（LAN，真监控+注入）。
8. **共享 SSO + `life_events` 的 2 类事件流**（fitness/finance→Planner）。

### B. 看起来完成但尚未闭环
1. **Kenos Today/Work/Approvals/Focus** — UI 精致，底层 0 行 + 生产写 fail-closed + fixture。
2. **Capture/Inbox** — 契约完整，flag-dark，2 行。
3. **Finance Decision/Goals/Review** — 全 CRUD，5 表 0 行。
4. **Kenos 命令闭环** — 幂等/审计真，**outbox 投递半永不执行**。
5. **助手审批层** — 全套建好，助手绕过直调。
6. **Home 物件认亲/VLM** — 算法真，仅离线手动批处理。
7. **原生 iOS** — 真机装成功，崩溃率≈1:1。

### C. 生产力系统的五个最大断点（按影响排序）
1. **无自主执行器（outbox 不 drain + writers fail-closed）** — 助手能提案不能自主执行多步；"acting system"是抱负非现实。
2. **无统一对象 / object_ref** — Project 不能聚合任务+日历+笔记+文档+费用+活动；Today 无法真编排、完成不联动。
3. **捕获→分类→转换闭环未开灯** — 无自动分类，两条并行捕获路径，Inbox 是架构非习惯。
4. **职业"工作"场景无 owner** — Work 是 mock，会议/决策/干系人/跟进/周复盘全缺，散落各处。
5. **本地-AI + 单机存储 SPOF + 部署漂移 + 原生崩溃** — 可靠性地基，让人不敢托付真实工作。

### D. 当前不应继续投入的区域
1. **Finance 规划层**（Decision Studio/Scenarios/Goals/Review）——全 CRUD 建好 0 行，过早范围。
2. **Kenos 治理死表**（`kenos_deferred_items`/`kenos_proactive_suggestions`——无 writer 无 caller，纯死重）。
3. **Music `track_embeddings` / Home `storage_snapshots`** ——建好未用镜像。
4. **再加新 Domain / 新 App** ——路线图自警"复利不在再做一个 app"。
5. **三套并行注册表 + 影子读模型** ——收敛而非扩张（cutover 收口）。

### E. 下一阶段候选方向

| 候选方向 | 用户价值 | 解决断点 | 前置依赖 | 风险 | 规模 | 优先级 |
|---|---|---|---|---|---|---|
| **1. Productivity Core First**(Inbox·Project·Task·Calendar·Today·Focus·Review) | 高——把日用真源串成真编排 | 断点 2/3/4 | object_ref 轻量版 | 中(触碰多域) | L | **P0(推荐)** |
| **2. Assistant Execution First**(Context·Actions·Approvals·多步·Activity·Recovery) | 高——点亮"acting" | 断点 1/5 | outbox worker + 审批接线 + writer canary | 高(安全/回滚) | L | P1 |
| 3. Domain Completion First(逐个补 CRUD) | 中——各域已 Reliable Daily | 断点较少 | 各域独立 | 低 | M | P2 |
| **4. 混合(推荐)：先地基后编排** | 最高 | 全部 | 见下 | 中 | L | **推荐** |

**推荐第四路线（混合）——为何更优：** 断点 1（执行器）与断点 5（可靠性地基）是**信任前提**，断点 2/3（对象/捕获）是**价值前提**。纯路线 1 会在不可靠地基上盖编排；纯路线 2 会点亮一个无统一对象可操作的执行器。**建议顺序：**
1. **先收地基（1–2 周）：** 上 outbox worker（或删 outbox 明确同步语义）+ 把 cursor-bridge 纳入 git + 恢复/明确部署 CD + 修 CI 单测缺口。→ 解断点 1/5 的信任前提。
2. **再轻量统一对象（object_ref 最小版）：** 让一个 Project 能挂任务+笔记+活动（先 Plan+Knowledge+life_events 三方），Today 从聚合升为可联动。→ 解断点 2/3。
3. **最后点亮助手执行：** 把已建好的审批层接进 `executeTool`，开 writer canary，让助手走"提案→审批→执行→activity"。→ 解断点 1 的价值面。
4. **Work 不新建 Domain**：待 object_ref + Connector 就绪后，由统一 Project 模型 + 真连接器承载职业场景（断点 4）。

---

## 十三、AUDIT STATUS

```text
AUDIT STATUS:                完成(evidence-based, read-only)
REPOSITORY REVIEWED:         YES — HEAD 23cb21e14; 12 apps / 9 packages / clients/apple
DEPLOYMENT REVIEWED:         YES — 9 Netlify 站 + stop_builds=true 全站(CD 当前关) + deploy-all 脚本
DATABASE REVIEWED:           YES — Supabase iueozzuctstwvzbcxcyh live-query(计数+最后写入+advisors)
APPLE CLIENTS REVIEWED:      YES — Kenos SwiftUI 壳(iOS 真机装/崩溃遥测) + Tauri/Capacitor 壳 + watchOS(仅模拟器)
LOCAL SERVICES REVIEWED:     YES — llama-swap 网关 / Health launchd / cursor-bridge(未追踪) / web-state-bridge(兄弟仓 UNKNOWN)
BROWSER/CONNECTORS REVIEWED: YES — Finance Sync 插件 LIVE；Jira/GitHub/Figma 连接器仅 fixture(PLANNED)
EVIDENCE COMPLETE:           MOSTLY — 见 UNVERIFIED
UNVERIFIED AREAS:
  - 156/150 core-loop 行的来源(clean-room 重放 vs 真实应用内助手)——DB 时间戳无法区分
  - activity 覆盖索引是否已 apply 到生产(列为 owner gate)
  - 07-22 崩溃修复的后效(修复与最新日志同日,post-fix 遥测未出)
  - web-state-devtools/bridge 内部(仓外)
  - HealthOS/KnowledgeOS Tauri "LIVE" 依赖记忆笔记,未在本轮真机复验
  - 是否有任何 preview/canary host 设了 VITE_KENOS_READ_CANARY=1
  - stop_builds 快照后是否发生过手动部署
P0(本审计):
  - outbox 无 drainer(写循环无执行器)
  - cursor-bridge 守护未纳入 git(不可复现/审)
  - Finance Review 队列无生产者(成功 UI 写不进)
  - Git 自动部署关 + 共享工作树部署漂移风险
P1(本审计):
  - 助手写工具不经已建好的审批层
  - Kenos 死表(deferred/proactive 无 writer)+ 空治理表(security-review 负担)
  - 原生 iOS 崩溃率高(349 session/338 crash,修复未验证)
  - CI 漏单测/MCP;fitness 测试 master 红
  - 工作树当前 revert HealthKit entitlement(疑共享工作树 clobber,若提交则 HealthKit 再断)
  - Knowledge web↔native Vault 不同步
  - F5 QA 报告"closed/READY"高估(29 commit 本地未 push)
RECOMMENDED REVIEW INPUT:    READY
```

**READY 判断依据：** 证据跨仓库/DB/部署/Apple/本地服务/测试六面交叉，冲突已标注（文档 vs 实现，以实现为准），未确认项已明列 UNKNOWN 及验证方法。可支持外部架构与产品审核。
