# Life OS Ticket 命名约定

**SSOT：** Hub / Agent / Gate 文档中的 **canonical ID（v2）** 以本文件为准。
**维护：** 新 ticket **只写 v2**；v1 单字母前缀仅作 legacy 别名。

## v2 语法（当前 canonical）

```text
{APP3}.{TRACK}.{SEQ}              父 ticket     PLNR.SCHED.0 · FINC.PURCHASE.6 · PAPR.SYS.1
{APP3}.{TRACK}.{SEG}.{sub}        子 gate       PAPR.SYS.1b.jrn
{APP3}.{TRACK}.{SEQ}.{sub}        日程子 gate   PLNR.SCHED.0.migrate
```

| 规则            | 说明                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **APP3**        | **3–4 字母**，全局唯一；**任意两码首 2 字母不得相同**（防 `FINC`/`FITN` 类误读）；对照 Netlify workspace（见下表） |
| **TRACK**       | App 内轨道：`SCHED` `SYS` `UI` `DATA` … — **PaperOS 用独立 APP3 `PAPR`**，不挂在 `PLNR` 下                         |
| **Canonical**   | Hub §Now/§Next、`AGENT_WORKSTREAMS` Hub ID、Agent prompt **只写 v2**                                               |
| **Legacy v1**   | `P-*` / `P-MOVE-*` / `F-*` / `FT-*` 等；grep 时两格都要搜                                                          |
| **Legacy v0**   | `P-MOVE-SYS-*` / `SYS-*` / `SCH-*`；见各对照表                                                                     |
| **状态不进 ID** | PASS / BLOCKED / PAUSED 写在 status 列                                                                             |
| **分支**        | `agent/{canonical-kebab}-{slug}` · 例：`agent/PAPR.SYS.1-design`                                                   |
| **Commit**      | `{canonical}: {message}`                                                                                           |
| **校验**        | `npm run verify:ticket-naming`（漂移 guard；见 `scripts/verify-ticket-naming.mjs`）                                |

**v2 格式校验（文档 / CI）：**

```text
^[A-Z]{3,4}\.[A-Z][A-Z0-9]*(\.[a-z0-9]+)*(\.[0-9]+)?$
```

示例：`PAPR.SYS.1` · `PAPR.SYS.1b.jrn` · `PLNR.SCHED.0.migrate` · `FINC.PURCHASE.6.r0`

## 为何 PaperOS = 独立 `PAPR`（非 `PLNR.*`）

对齐业界 **shell / product 分 ID** 实践：

| 来源                                                                                  | 模式                                                                  | Life OS 映射                                                    |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Flatpak Application ID](https://docs.flatpak.org/en/latest/conventions.html)         | reverse-DNS **系统 ID** ≠ 用户可见产品名；扩展/子产品可挂 base app-id | **`PAPR.*`** = 设备 Shell 系统轨；`PLNR.*` = Web 产品           |
| [Android `applicationId`](https://developer.android.com/build/configure-app-module)   | 商店/设备唯一 ID 可与代码 `namespace` 分离；flavor 用 suffix 区分变体 | PaperOS 与 Planner **不同产品面**；API provider 可换不换 ticket |
| [Appian 对象前缀](https://docs.appian.com/suite/help/26.5/Standard_Object_Names.html) | 每 app 用 **3–4 字母 initialism**（如 HRO）作全局前缀                 | `PLNR` / `FINC` / **`PAPR`** 同级 APP3                          |
| ERP / APM 域前缀惯例                                                                  | 2–4 字母 **business domain code** 分组对象                            | `SYS` `UI` `DATA` 等为 TRACK，不进 APP3                         |

| 层级           | Life OS             | 说明                                                                      |
| -------------- | ------------------- | ------------------------------------------------------------------------- |
| **设备 Shell** | **`PAPR.*`**        | reMarkable 上 Qt Shell、lifecycle、离线、launcher — **跨 Ken app 消费端** |
| **Web App**    | `PLNR.*` `FINC.*` … | 各 `*.kenos.space` 产品与 API                                             |
| **集成**       | `INTG.*`            | SSO、`life_events`、Portal 摘要                                           |

**`PAPR`** = **Pap**e**R**（产品名 PaperOS 的核心词；与 `PLNR`/`FINC`/`GYMS` 一样取 app 名而非叠 `OS`）。

| 候选                     | 问题                                         | 结论             |
| ------------------------ | -------------------------------------------- | ---------------- |
| `PLNR.MOVE.*`            | PaperOS 非 Planner 子功能；`MOVE` 语义含糊   | ❌ 废止          |
| `PLNR.PPOS.*` / `PPOS.*` | 仍挂在 PLNR 下或叠 `OS`；`PPOS` 易读成 P-O-S | ❌ interim 废止  |
| **`PAPR.*`**             | 独立 APP3；可读；与现有 APP3 风格一致        | ✅ **canonical** |

PaperOS **首个数据提供方**是 Planner（`/api/paper/*`），但 ticket **不归入 PLNR**，以便后续接 Finance / Fitness / Portal 等设备模块时不改 ID 体系。

**代码现状：** 设备与 `/api/paper/*` 暂驻 `apps/planner`（`planner-os` workspace）；**文档与 Hub ID 以 `PAPR` 为准**。独立 workspace / Netlify 站为远期选项，不阻塞当前命名。

## App Registry（v2 · APP3）

| APP3     | App / 域               | Workspace / 部署                          | Legacy                                                            | 主要 TRACK                                       |
| -------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| **PAPR** | **PaperOS** 设备 Shell | 代码暂驻 `planner-os` · 无独立 Netlify 站 | `P-MOVE-*` · ~~`PLNR.PPOS.*`~~ · ~~`PLNR.MOVE.*`~~ · ~~`PPOS.*`~~ | `SYS` · `UI` · `DATA` · `DEV` · `WRITE` · `SYNC` |
| **PLNR** | Planner                | `planner-os`                              | `P-`                                                              | `SCHED` · `PROJ` · `CORE` · `UIUX` · `ATTACH`    |
| **FINC** | Finance                | `finance-os`                              | `F-`                                                              | `PURCHASE` · `SYNC` · `CORE` · `GROWTH`          |
| **GYMS** | Fitness                | `fitness-os`                              | `FT-` · ~~`FITN.*`~~                                              | `SUB` · `PORTAL` · `EVENTS` · `CORE`             |
| **MUSC** | Music                  | `music-os`                                | `M-`                                                              | `PIPE` · `CORE`                                  |
| **PORT** | Portal / Growth        | `portal`                                  | `G-`                                                              | `GROWTH` · `CARD`                                |
| **HOME** | Home                   | `home-os`                                 | `H-`                                                              | `PROJ` · `SPATIAL`（`H-W*` → `HOME.SPATIAL.*`）  |
| **INTG** | Integration            | —                                         | `I-`                                                              | `EVENTS` · `IDENTITY`                            |
| **DSGN** | Design 系统            | —                                         | `D-`                                                              | `CATALOG`                                        |
| **PLAT** | Platform 共享包        | —                                         | `C-`                                                              | `CONTRACTS`                                      |

**前缀注记：** `PLNR` 与 `PLAT` 共享首 2 字母 `PL` — `PLAT.*` 仅已发货 infra 简史，**不出现在 Hub §Now/§Next**；活跃产品码以第 3 字母区分（`NR` vs `AT`）。新增 **§Now 级** APP3 仍须满足首 2 字母唯一（见上表 `FINC`/`GYMS` 定案）。

**E2E 问题码（非 Hub ticket）：** Fitness 端口冲突原 **`F-0`** → **`QA-GYMS-0`**（legacy ~~`QA-FITN-0`~~；≠ Finance `FINC.*`）。

**文件名例外：** `apps/fitness/docs/FT-P5-*.md` 等历史文件名保留 legacy 前缀；Hub 引用 **canonical `GYMS.SUB.5`**。

完整防混淆表 → [`apps/README.md`](./apps/README.md) §ID 命名。

### APP3 防混淆（`FINC` vs Fitness）

业界（[SAP 模块缩写](https://www.kodyaz.com/articles/sap-module-abbreviations.aspx) · [APM 域前缀](https://www.sparxsystems.us/application-portfolio-management/application-naming-convention-guide/)）要求 **domain code 在扫读时一眼可辨**；SAP 用 **FI** 表 Finance，从不用 **FIT** 表其他域。

| 对比 | `FINC`         | ~~`FITN`~~                                         | **`GYMS`**                                    |
| ---- | -------------- | -------------------------------------------------- | --------------------------------------------- |
| 字母 | F-I-N-C        | F-I-T-N                                            | **G-Y-M-S**                                   |
| 问题 | Finance 已定稿 | 与 `FINC` **共享 `FI` 前缀**；第 3 位 `T`/`N` 易混 | 首 2 字母 **`GY`** ≠ **`FI`**；训练域语义清晰 |
| 结论 | ✅ 保留        | ❌ 2026-07-11 废止                                 | ✅ **Fitness canonical**                      |

**`GYMS`** = **GYM** + **S**（4 字母对齐 `MUSC`/`PORT`/`HOME`；产品品牌仍为 **FITNESS.OS**，仅 **Hub ticket ID** 用 `GYMS.*`）。

新增 APP3 前：对照本表 + Registry，确保与现有码 **首 2 字母不撞车**。

## v2 ↔ Legacy v1（活跃 Hub）

### PAPR — PaperOS（设备 Shell）

| v2 Canonical         | Legacy v1                                                                                | Legacy v0 / 备注                                 |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **PAPR.DATA.verify** | `P-MOVE.verify` · `P-MOVE-VERIFY` · ~~`PLNR.PPOS.*`~~ · ~~`PLNR.MOVE.*`~~ · ~~`PPOS.*`~~ | 原 `P-MOVE-BLOCK` · **冻结 PASS** · 生产读路径   |
| **PAPR.SYS.0**       | `P-MOVE.SYS.0`                                                                           | `P-MOVE-SYS-0` · `SYS-0`                         |
| **PAPR.SYS.1a**      | `P-MOVE.SYS.1a`                                                                          | `P-MOVE-SYS-1A` · `SYS-1A`                       |
| **PAPR.SYS.1b**      | `P-MOVE.SYS.1b`                                                                          | `P-MOVE-SYS-1B`                                  |
| **PAPR.SYS.1b.fs**   | `P-MOVE.SYS.1b.fs`                                                                       | `P-MOVE-SYS-1B-FS`                               |
| **PAPR.SYS.1b.jrn**  | `P-MOVE.SYS.1b.jrn`                                                                      | `P-MOVE-SYS-1B-JRN`                              |
| **PAPR.SYS.1**       | `P-MOVE.SYS.1`                                                                           | `P-MOVE-SYS-1` · `SYS-1` · **PAUSED**            |
| **PAPR.SYS.2**       | `P-MOVE.SYS.2`                                                                           | `P-MOVE-SYS-2` · `SYS-2`                         |
| **PAPR.SYS.3**       | `P-MOVE.SYS.3`                                                                           | `P-MOVE-SYS-3` · `SYS-3`                         |
| **PAPR.SYS.gate**    | `P-MOVE.SYS.gate`                                                                        | `SYS-GATE`                                       |
| **PAPR.UI**          | `P-MOVE.UI` · `P-MOVE-UI`                                                                | E-ink Shell IA / QML                             |
| **PAPR.UI.1.1**      | `P-MOVE.UI.1.1`                                                                          | Slice 1.1                                        |
| **PAPR.UI.2**        | `P-MOVE.UI.2`                                                                            | Slice 2                                          |
| **PAPR.WRITE.5**     | `P-MOVE.5` · `P-MOVE-5`                                                                  | controlled write staging（API 侧常由 PLNR 提供） |
| **PAPR.SYNC.6**      | `P-MOVE.6` · `P-MOVE-6`                                                                  | 定时缓存 + 手动 Sync                             |
| **PAPR.DEV.1**…**4** | `P-MOVE.1`…`4` · `P-MOVE-1`…`4`                                                          | 设备里程碑 · **冻结**                            |
| **PAPR.DEV.7**       | `P-MOVE-7`                                                                               | 文档导出 · planned                               |

**跨 app 关系（只读 / 未来扩展）：**

```text
PAPR (device) ──reads──► PLNR /api/paper/*     # 当前生产
              ──future──► FINC / GYMS / …      # 模块 ticket 仍用 PAPR.*，provider 在描述列注明
              ──auth────► INTG.IDENTITY.*
              ──events──► INTG.EVENTS.*（若设备消费 life_events）
```

PaperOS 生命周期依赖链：

```text
PAPR.DATA.verify ✅
→ PAPR.SYS.0 🟡
→ PAPR.SYS.1b.jrn ✅
→ PAPR.SYS.1 ⏸ PAUSED
→ PAPR.SYS.2 🔒
→ PAPR.SYNC.6 🔒
→ PAPR.SYS.gate 🔒
```

执行分卷：[`apps/paperos.md`](./apps/paperos.md)（PaperOS 已迁出独立仓库，详见该文件）

### PLNR — Planner

| v2 Canonical             | Legacy v1                 | Legacy v0 / 备注      |
| ------------------------ | ------------------------- | --------------------- |
| **PLNR.SCHED.0**         | `P-SCHED.0` · `P-SCHED-0` | 日程可用性            |
| **PLNR.SCHED.0.migrate** | —                         | `SCH-0`               |
| **PLNR.SCHED.10.pwa**    | —                         | `SCH-10`              |
| **PLNR.SCHED.10a.sim**   | —                         | `SCH-10A`             |
| **PLNR.SCHED.10b.ios**   | —                         | `SCH-10B`             |
| **PLNR.PROJ.3**          | `P-PROJ-3`                | Projects UI           |
| **PLNR.CORE.4**          | `P-P4`                    | Portal Today 计数对齐 |
| **PLNR.CORE.2**          | `P-P2` · `QA-P2`          | Insight E2E           |
| **PLNR.CORE.1**          | `P-P1`                    | —                     |
| **PLNR.CORE.3**          | `P-P3`                    | life_events inbox     |
| **PLNR.CORE.5**          | `P-P5`                    | Fitness 打卡徽章      |
| **PLNR.CORE.6**          | `P-P6`                    | Auth 单例             |
| **PLNR.CORE.7**          | `P-P7`                    | —                     |
| **PLNR.CORE.8**          | `P-P8`                    | —                     |
| **PLNR.UIUX.0**          | `P-UIUX-0`                | 全站走查              |
| **PLNR.ATTACH.0**        | `P-ATTACH-0`              | 附件底座              |
| **PLNR.ATTACH.1**        | `P-ATTACH-1`              | 图片/截图体验         |

### FINC — Finance

| v2 Canonical           | Legacy v1             |
| ---------------------- | --------------------- | ---------------- |
| **FINC.PURCHASE.6**    | `F-P6`                |
| **FINC.PURCHASE.6.r0** | `F-P6.r0` · `F-P6-R0` |
| **FINC.PURCHASE.6.a**  | `F-P6.a` · `F-P6a`    |
| **FINC.SYNC.1b**       | `F-P1b`               |
| **FINC.CORE.3**        | `F-P3`                |
| **FINC.GROWTH.1**      | `F-P1`                |
| **FINC.GROWTH.4**      | `F-P4`                | Portal 角标消减  |
| **FINC.IMPORT.5**      | `F-P5`                | History CSV 导入 |
| **FINC.CORE.2**        | `F-P2`                | 第二扩展源       |

### GYMS — Fitness

| v2 Canonical      | Legacy v1                     |
| ----------------- | ----------------------------- | --- |
| **GYMS.SUB.5**    | `FT-P5` · ~~`FITN.SUB.5`~~    |
| **GYMS.PORTAL.2** | `FT-P2` · ~~`FITN.PORTAL.2`~~ |
| **GYMS.EVENTS.1** | `FT-P1` · ~~`FITN.EVENTS.1`~~ |
| **GYMS.CORE.0**   | `FT-P0` · ~~`FITN.CORE.0`~~   |
| **GYMS.MEDIA.3**  | `FT-P3` · ~~`FITN.MEDIA.3`~~  | —   |
| **GYMS.SYNC.4**   | `FT-P4` · ~~`FITN.SYNC.4`~~   | —   |

### PORT / HOME / INTG / MUSC（已发货 · 新文档用 v2）

| v2                       | Legacy v1     |
| ------------------------ | ------------- | --- |
| **PORT.GROWTH.4b-H**     | `G-P4b-H`     |
| **PORT.GROWTH.6**        | `G-P6`        |
| **PORT.GROWTH.3**        | `G-P3`        | —   |
| **HOME.PROJ.7**          | `H-P7`        |
| **HOME.PROJ.6a**         | `H-P6a`       |
| **HOME.EXPER.0**         | `H-P0`        | —   |
| **HOME.PORTAL.1**        | `H-P1`        | —   |
| **HOME.SSO.2**           | `H-P2`        | —   |
| **HOME.SSO.3**           | `H-P3`        | —   |
| **HOME.SYNC.4**          | `H-P4`        | 扫描/照片/追加事件云链路已发货；完整可编辑 spatial 项目同步仍未完成 |
| **HOME.UIUX.5**          | `H-P5`        | Home 平面 UX 打磨；已发货 |
| **HOME.ONBOARD.9**       | `H-P9`        | —   |
| **HOME.SMOKE.10**        | `H-P10`       | —   |
| **HOME.STORAGE.11**      | `H-P11`       | —   |
| **HOME.RECOG.0**         | —             | 生产 schema / git 真源闭环 |
| **HOME.RECOG.1**         | —             | Quick Scan 安静模式 + 质量摘要 |
| **HOME.RECOG.2**         | —             | embedding matcher + 全局一对一 |
| **HOME.RECOG.3**         | —             | 证据式确认 UI |
| **HOME.MCP.13**          | —             | `where_is` MCP → AIOS |
| **HOME.SPATIAL.0**…**5** | `H-W0`…`H-W5` |
| **INTG.EVENTS.1b**       | `I-P1.5b`     |
| **INTG.IDENTITY.0**      | `I-P0`        |
| **MUSC.PIPE.5**          | `M-P5`        |
| **MUSC.UI.2**            | `M-P2`        | —   |
| **MUSC.PIPE.3**          | `M-P3`        | —   |
| **MUSC.PORTAL.7**        | `M-P7`        | —   |
| **MUSC.PLAY.8**          | `M-P8`        | —   |

### AIOS / KNOW / HLT（本地优先 app）

| Canonical | 说明 |
| --- | --- |
| **AIOS.\*** | AIOS 本地 AI 助手 |
| **AIOS.STABLE.26** | AIOS 核心链路回归护栏 |
| **KNOW.\*** | KnowledgeOS 长期记忆层 |
| **KNOW.EDITOR.7** | KnowledgeOS 块编辑器 WIP 稳定化 |
| **HLT-0** | HealthOS app 基建 |
| **HLT-1** | Focus 防沉迷 agent |
| **HLT-2** | 六维 State Engine |
| **HLT-3** | 自适应专注策略 |
| **HLT-4** | HealthKit / 跨日趋势 |
| **HLT-5** | companion 真机签名与持续交付 gate |

### PLAT — Platform（已发货简史 · legacy `C-*`）

| v2                   | Legacy v1        |
| -------------------- | ---------------- |
| **PLAT.CONTRACTS.0** | `C-P0`           |
| **PLAT.CONTRACTS.1** | `C-P1`（若曾用） |
| **PLAT.CORE.2**      | `C-P2`           |
| **PLAT.SHELL.1**     | `PLAT-P0-1`      |
| **PLAT.SHELL.2**     | `PLAT-P0-2`      |
| **PLAT.SHELL.3**     | `PLAT-P0-3`      |
| **PLAT.CI.0**        | —                | master CI / 生成物 / 交付完整性恢复 |

### DSGN — Design（已发货简史 · legacy `D-*`）

| v2                 | Legacy v1        |
| ------------------ | ---------------- |
| **DSGN.CATALOG.0** | `D-P0`           |
| **DSGN.CATALOG.1** | `D-P1`           |
| **DSGN.CATALOG.2** | `D-P2`           |
| **DSGN.CATALOG.3** | `D-P3`           |
| **DSGN.CATALOG.4** | `D-P4`           |
| **DSGN.CATALOG.5** | `D-P5`           |
| **DSGN.CATALOG.6** | `D-P6`（若曾用） |

**审计场景码（非 Hub ID）：** `planner-schedule-uiux-audit.md` 中 `SCH-1`…`SCH-9` 为 **PLNR.SCHED.0** 走查子场景。

## Hub 表列（推荐）

| Canonical ID      | App         | Title                             | Status           |
| ----------------- | ----------- | --------------------------------- | ---------------- |
| `PAPR.SYS.1`      | **PaperOS** | Device launcher — journal watcher | PAUSED BY OWNER  |
| `FINC.PURCHASE.6` | Finance     | Expense purchase review           | 6.a CODE COMPLETE · CLOSURE QA |

## Agent prompt 模板

```markdown
Hub ID: PAPR.SYS.1 # v2 canonical · PaperOS shell（非 PLNR）
Legacy: P-MOVE.SYS.1 / P-MOVE-SYS-1 / SYS-1
Data provider (today): PLNR /api/paper/\*
Status: PAUSED BY OWNER
```

## 禁止

- 新 ticket 使用 ~~`FITN.*`~~ 或单字母 App 前缀（`P-` / `F-` / `FT-`）作为 canonical
- 把 PaperOS 挂在 **`PLNR.PPOS.*`** / **`PLNR.MOVE.*`** / ~~**`PPOS.*`**~~ 或含糊 **`MOVE`** track 下
- 为同一 ticket 发明第四套名字
- 把状态写进 ID
- 用 `P-MOVE-BLOCK`（→ `PAPR.DATA.verify`）

## 相关

- [`apps/README.md`](./apps/README.md) — 分卷对照
- [`apps/paperos.md`](./apps/paperos.md) — PaperOS 独立仓库指针
- [`AGENT_WORKSTREAMS.md`](./AGENT_WORKSTREAMS.md) — 执行分线与当前焦点
- [`../MAINTENANCE.md`](../MAINTENANCE.md) — 文档维护
