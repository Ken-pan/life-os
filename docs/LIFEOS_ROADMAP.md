---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-08
review_cadence: monthly
doc_role: status-hub
priority_model: 2026-07-08-home-growth
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → [`roadmap/`](./roadmap/README.md)
>
> **优先级依据（2026-07-08）：** Core 闭环 → 防回归（CI + E2E）→ **Growth（Portal 读 `core_*` + 单 App 管道闭环）** → 窄范围 Design。外部对标见 [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)。

## 一句话

Life OS 是 **六 app 个人生活平台**（Planner / Fitness / Finance / Music 四生产站 + Portal 启动器 + **Home 实验**），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）

| 序  | ID       | 主题                 | 桶     | ROI | 下一步                                           | 验收                                               |
| --- | -------- | -------------------- | ------ | --- | ------------------------------------------------ | -------------------------------------------------- |
| 1   | **I-P0** | SSO 跨域体验         | Core   | 🔥  | 人工生产 E2E：Finance 登录 → Planner/Portal 免登 | 无痕 `.kenos.space` 跨站（自动化预检 ✅）          |
| 2   | **M-P1** | Music `play_events`  | Growth | ◆   | 生产登录播歌验证 + reasons UI                    | 见 [`roadmap/GROWTH.md`](./roadmap/GROWTH.md#m-p1) |
| 3   | **F-P1** | Finance 扩展同步反馈 | Growth | ◆   | 生产扩展 → 主站 toast 验收                       | popup last sync + 主站 toast                       |

**Week 1–3 已落地（2026-07-08）：** I-P1 Portal redirect/DB · P2 `schema.sql` `core_*` · CI-补 · QA-F0 · G-P1–G-P3 · G-P5 PWA 引导。

### Next — 已排期

| ID           | 主题                                      | 桶       | ROI | 触发 / 范围                                |
| ------------ | ----------------------------------------- | -------- | --- | ------------------------------------------ |
| **G-P2**     | Portal 待办 / `life_events` 角标          | Growth   | ◆   | ✅ 只读计数已接；Finance bill_due 生产验收 |
| **H-P1**     | Portal Launcher 加 Home 实验入口          | Growth   | ○   | `home.kenos.space` 已部署；非四站同级      |
| **H-P2**     | Home 接 `coreIdentity` + SSO              | Core     | ○   | I-P0 通过后；与四站同模式                  |
| **H-P3**     | Supabase redirect + DB `app_id` 含 `home` | Core     | ○   | 与 H-P2 同批                               |
| **D-P6**     | a11y gates                                | Infra    | ○   | **窄范围**：`platform-web` + catalog       |
| **G-P4**     | Portal「今日摘要」只读卡片                | Growth   | ○   | G-P1–G-P3 后；可含 Home 储藏区摘要         |
| **I-P1.5b**  | Fitness 完练 → Planner 打卡               | Growth   | ○   | **须有每天用两站的场景**                   |
| **QA-P2**    | Planner desktop E2E                       | Infra    | ○   | FAB/侧栏对齐 desktop project               |
| **C-P2 P2+** | Finance React 共享 UI                     | Platform | ✗   | 第 3 React 消费者前不做                    |
| **C-P1+**    | Finance nav contracts mirror              | Platform | ✗   | `contracts/events` 已够                    |

Growth / Home 细节 → [`roadmap/GROWTH.md`](./roadmap/GROWTH.md) · [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)

### 推荐执行顺序（单人 · 约 3–4 周）

```text
Week 1 — Core 闭环
  ① I-P0 SSO 生产 E2E
  ② I-P1 Supabase redirect + DB constraint（portal）
  ③ P2 债 schema.sql 合并 core_*

Week 2 — 防回归
  ④ CI-补 boundaries + identity/outbox smoke
  ⑤ QA-F0 Fitness E2E 端口

Week 3 — Growth · Portal 用满 core_*
  ⑥ G-P1 继续 → last_opened_at（DB）
  ⑦ G-P3 default_app 自动跳转
  ⑧ G-P2 待办 / 事件角标

Week 4 — Growth · 单 App 管道闭环
  ⑨ M-P1 Music play_events 生产 + reasons
  ⑩ F-P1 Finance 扩展同步反馈
  ⑪ G-P5 PWA 安装引导（六站，可与 ⑨⑩ 并行）

按需（不阻塞）
  H-P1 Portal 加 Home 实验卡
  H-P2 + H-P3 Home SSO + redirect（**每天用 Home 时**与 I-P0 同批）
  G-P4 今日摘要卡片
  I-P1.5b Fitness → Planner（有场景再开）
  D-P6 窄范围 a11y
  QA-P2 Planner desktop E2E
```

完成 Week 1 三项后，可将 **I-P0 / I-P1 配置 / P2 债** 从 §Now 移入 §Shipped。

### Shipped — 近期已落地（摘要）

| 主线        | 摘要                                                                           | 详情                                                      |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅               | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md)      |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                                             | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)            |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）                      | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                |
| Integration | I-P1 Portal DB + redirect · P2 `schema.sql` · G-P1–G-P3 · G-P5 · CI-补 · QA-F0 | [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)              |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/PWA 引导）                | `apps/portal`                                             |
| Home        | `home.kenos.space` CLI 部署；spatial WIP 🟡                                    | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0) |
| CI          | design-catalog smoke + snapshots 进 GHA                                        | `.github/workflows/ci.yml`                                |

完整发货记录与 commit 锚点 → [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

### Parked — 搁置 / 实验

| ID                   | 说明                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **I-P2** 跨应用智能  | 依赖更多 `life_events` 消费端                                                                  |
| **H-P0** `apps/home` | 第六 app · 户型/储藏 spatial + 工坊；`home.kenos.space` CLI 已部署；**未进 Portal / 未接 SSO** |
| **H-P4** Home 云同步 | spatial 项目 Supabase 持久化（现 `localStorage` only）                                         |
| **H-P5** Home 工坊   | `?studio=1` 家具拖拽默认可用（现 feature flag）                                                |

---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：

| 类别     | 不做的事                                                                      | 原因                                                    |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 工具链   | Jira / ProductPlan / 重型 PM SaaS                                             | 单人团队；repo 内 Markdown 即真源                       |
| 设计流程 | Storybook-first / **Figma / Figma-first**                                     | 无 Figma；已定 token-first + design-catalog             |
| 架构     | 合并各 app 业务表；app 互引                                                   | 边界硬规则                                              |
| 抽象     | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                  | 见 [`roadmap/BACKLOG.md`](./roadmap/BACKLOG.md) §不提取 |
| 产品     | Home 升四站同级（云同步、默认 Launcher、life_events）                         | Home 实验性；H-P4/H-P5 搁置；Integration 先 H-P2/3      |
| 产品     | I-P2 智能推荐；无场景的 `life_events` 扩展                                    | I-P2 无消费者                                           |
| 产品     | 全模块 AI Life OS；第三方 SaaS 聚合（Todoist/Notion/Chase）；自动打电话 Agent | 对标 FluxOS/PAI/Iddu；单人不可维护                      |
| 页面     | production app 页面 token 迁移；六 app 全量 a11y audit                        | D 线只做共享 primitive + catalog                        |
| Platform | Finance `ui-react` / nav mirror / i18n 统一                                   | 仅 Finance 一个 React 栈；见 §Next ✗                    |

---

## 架构不变量（Present）

```text
严格边界 · 统一身份 · 事件驱动 · 受控互通
```

| 规则         | 要点                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 依赖         | `@life-os/contracts` 为根；`apps/*` **禁止**互引                     |
| 数据         | 业务表各 app 自有；跨 app 走 `core_*` 或 `life_events`               |
| 身份         | `auth.uid()` + `.kenos.space` 跨子域 Cookie（`setupCrossDomainSSO`） |
| 设计         | `packages/design-tokens` → generated CSS；catalog 只做 preview       |
| Package 方向 | `contracts` ← `platform-web` ← `apps`；`theme` / `sync` 侧向共享     |

Package 依赖表、提取决策矩阵、do-not-abstract 全表 → [`roadmap/BACKLOG.md`](./roadmap/BACKLOG.md)

契约白名单 → [`architecture/contracts.md`](./architecture/contracts.md)

---

## 主线速览

命名：`I-*` Integration · `C-*` Platform/Contracts · `D-*` Design · `G-*` Growth（Portal/跨站）· `M-*` Music · `F-*` Finance 扩展 · `H-*` Home 实验

| 主线                 | 当前状态                    | 深度文档                                                   |
| -------------------- | --------------------------- | ---------------------------------------------------------- |
| **I-P0** 统一身份    | 🟡 已落地，SSO 待 E2E       | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p0)  |
| **I-P1** Portal      | 🟡 已上线，收尾中           | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p1)  |
| **I-P1.5** 事件中心  | ✅ 管道通；I-P1.5b 按需     | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p15) |
| **G-P1–G-P5** Growth | ⏳ Week 3+ 已排期           | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                 |
| **H-P0** Home 实验   | 🟡 已部署；Integration 未接 | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)  |
| **C-P1+** 平台扩容   | 🟡 Finance 部分接入；低优先 | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)             |
| **D-P6** 设计系统    | ⏳ 窄范围 a11y（Next）      | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                 |

### 六 app 一览

| App     | 层级   | URL                                                | Workspace    | SSO         | Portal      | 下一步 / 备注                       |
| ------- | ------ | -------------------------------------------------- | ------------ | ----------- | ----------- | ----------------------------------- |
| Planner | 生产   | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | 🟡 I-P0 E2E | ✅ Launcher | 任务/日历/AI；`life_events` 消费端  |
| Fitness | 生产   | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | 🟡          | ✅          | Focus 训练；QA-F0 端口债            |
| Finance | 生产   | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | 🟡          | ✅          | 月度推演；**Chrome 扩展**同步       |
| Music   | 生产   | [music.kenos.space](https://music.kenos.space)     | `music-os`   | 🟡          | ✅          | M-P1 `play_events` 生产验收         |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space)   | `portal`     | 🟡 Week 1   | —           | I-P1 redirect/DB；G-P1–G-P3 Week 3+ |
| Home    | 实验   | [home.kenos.space](https://home.kenos.space)       | `home-os`    | ❌          | ❌          | spatial + 工坊；H-P1–H-P3 按需      |

**插件（生产向，非第六 app）：** Finance OS Sync — `apps/finance/extension`（DOM 抓取 → 主站同步）

部署与 Site ID → [`ops/netlify.md`](./ops/netlify.md) · Portal → [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p1) · Home → [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)

## 验收命令

```bash
./scripts/verify-life-os-identity-p0.sh    # I-P0
./scripts/test-outbox-trigger.sh --smoke   # I-P1.5
npm run check:lifeos-boundaries            # C-P0
npm run validate:tokens                    # D 线 token 完整性
npm run test:design-catalog                # 172 smoke
npm run test:design-catalog:snapshots    # 80 pixel baselines
```

**CI（`.github/workflows/ci.yml`）：** `validate:tokens` + Turbo `build`；design-catalog smoke + snapshots。**Week 2 目标（CI-补）：** 加 `check:lifeos-boundaries` + `verify-life-os-identity-p0.sh` / `test-outbox-trigger.sh --smoke`。

## 运维索引

| 主题                          | 文档                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| Supabase 迁移 / `schema.sql`  | [`ops/supabase.md`](./ops/supabase.md)                                |
| Netlify 六站                  | [`ops/netlify.md`](./ops/netlify.md)                                  |
| 契约                          | [`architecture/contracts.md`](./architecture/contracts.md)            |
| 事件 RFC                      | [`architecture/events-rfc.md`](./architecture/events-rfc.md)          |
| PWA / iOS                     | [`qa/pwa-ios.md`](./qa/pwa-ios.md)                                    |
| 文档地图                      | [`README.md`](./README.md) · [`MAINTENANCE.md`](./MAINTENANCE.md)     |
| Growth / Portal / 单 App 闭环 | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                            |
| 历史归档 / 分卷               | [`roadmap/`](./roadmap/README.md) · [`archive/`](./archive/README.md) |

## 维护约定

详见 [`MAINTENANCE.md`](./MAINTENANCE.md)。Hub 只维护 §Now / §Next / §Shipped / §Not doing；阶段史与证据写入 `roadmap/` 分卷。

_旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。_
