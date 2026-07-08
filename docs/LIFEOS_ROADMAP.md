---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-08
review_cadence: monthly
doc_role: status-hub
priority_model: 2026-07-08-growth-research
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → [`roadmap/`](./roadmap/README.md)
>
> **优先级依据（2026-07-08）：** Core 闭环 → 防回归（CI + E2E）→ **Growth（Portal 读 `core_*` + 单 App 管道闭环）** → 窄范围 Design。外部对标见 [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)。

## 一句话

Life OS 是 **五站互通的个人生活平台**（Planner / Fitness / Finance / Music + Portal 启动器），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）

| 序  | ID        | 主题                  | 桶    | ROI | 下一步                                                                      | 验收                                                      |
| --- | --------- | --------------------- | ----- | --- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | **I-P0**  | SSO 跨域体验          | Core  | 🔥  | 生产 E2E：Finance 登录 → Planner/Portal 免登；失败则先修再往下              | 人工 `.kenos.space` 跨站                                  |
| 2   | **I-P1**  | Portal 配置收尾       | Core  | 🔥  | Supabase 加 `portal.kenos.space/**`；DB constraint 扩 `portal`（与 ① 同批） | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p1) |
| 3   | **P2 债** | `schema.sql` `core_*` | Infra | 🔥  | migration `20260707230000` merge 进 canonical 快照                          | [`ops/supabase.md`](./ops/supabase.md)                    |
| 4   | **CI-补** | GHA 防回归            | Infra | ◆   | job 加 `check:lifeos-boundaries` + identity/outbox smoke                    | `.github/workflows/ci.yml`                                |
| 5   | **QA-F0** | Fitness E2E 端口      | Infra | ◆   | 修 5173 `reuseExistingServer` 误占 Portal（F-0）                            | [`qa/e2e-issues.md`](./qa/e2e-issues.md)                  |

**I-P1 刻意后置（等 ①② 通过后）：** Launcher 体验、PWA QA——Growth，非阻塞 Integration 闭环。

### Next — 已排期（Now 闭环后）

| ID           | 主题                                                    | 桶       | ROI | 触发 / 范围                           |
| ------------ | ------------------------------------------------------- | -------- | --- | ------------------------------------- |
| **G-P1**     | Portal「继续」→ `core_user_app_settings.last_opened_at` | Growth   | 🔥  | I-P1 DB ✅ 后；替换 localStorage-only |
| **G-P3**     | `default_app` 登录后自动跳转                            | Growth   | 🔥  | 与 G-P1 同批；migration 字段已有      |
| **G-P2**     | Portal 待办 / `life_events` 角标                        | Growth   | ◆   | SSO ✅ 后；只读计数                   |
| **M-P1**     | Music `play_events` 生产验收 + 推荐 reasons             | Growth   | ◆   | 管道已建；差生产播歌验证              |
| **F-P1**     | Finance 扩展同步反馈（Toast / last sync）               | Growth   | ◆   | 独有能力；1–2d                        |
| **G-P5**     | 五站 PWA 安装引导（从 Portal）                          | Growth   | ○   | manifest 已有；统一 iOS 文案          |
| **D-P6**     | a11y gates                                              | Infra    | ○   | **窄范围**：`platform-web` + catalog  |
| **G-P4**     | Portal「今日摘要」只读卡片                              | Growth   | ○   | G-P1–G-P3 后；需轻量 RPC              |
| **I-P1.5b**  | Fitness 完练 → Planner 打卡                             | Growth   | ○   | **须有每天用两站的场景**              |
| **QA-P2**    | Planner desktop E2E                                     | Infra    | ○   | FAB/侧栏对齐 desktop project          |
| **C-P2 P2+** | Finance React 共享 UI                                   | Platform | ✗   | 第 3 React 消费者前不做               |
| **C-P1+**    | Finance nav contracts mirror                            | Platform | ✗   | `contracts/events` 已够               |

Growth 细节与外部对标 → [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)

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
  ⑪ G-P5 PWA 安装引导（可与 ⑨⑩ 并行）

按需（不阻塞）
  G-P4 今日摘要卡片
  I-P1.5b Fitness → Planner（有场景再开）
  D-P6 窄范围 a11y
  QA-P2 Planner desktop E2E
```

完成 Week 1 三项后，可将 **I-P0 / I-P1 配置 / P2 债** 从 §Now 移入 §Shipped。

### Shipped — 近期已落地（摘要）

| 主线        | 摘要                                                             | 详情                                                 |
| ----------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅ | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md)` |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                               | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`       |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）        | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`           |
| Portal      | `portal.kenos.space` 上线；Turbo CI build ✅                     | §Portal 速览                                         |
| CI          | design-catalog smoke + snapshots 进 GHA                          | `.github/workflows/ci.yml`                           |

完整发货记录与 commit 锚点 → `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`

### Parked — 搁置 / 实验

| ID                   | 说明                                                       |
| -------------------- | ---------------------------------------------------------- |
| **I-P2** 跨应用智能  | 依赖更多 `life_events` 消费端                              |
| **H-P0** `apps/home` | 户型/储藏 spatial + 工坊拖拽编辑；`home.kenos.space` 已部署；SSO 未接 |

---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：

| 类别     | 不做的事                                                                      | 原因                                                    |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 工具链   | Jira / ProductPlan / 重型 PM SaaS                                             | 单人团队；repo 内 Markdown 即真源                       |
| 设计流程 | Storybook-first / **Figma / Figma-first**                                     | 无 Figma；已定 token-first + design-catalog             |
| 架构     | 合并各 app 业务表；app 互引                                                   | 边界硬规则                                              |
| 抽象     | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                  | 见 `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)` §不提取 |
| 产品     | Home OS 生产部署；I-P2 智能推荐；无场景的 `life_events` 扩展                  | Home 实验性；I-P2 无消费者                              |
| 产品     | 全模块 AI Life OS；第三方 SaaS 聚合（Todoist/Notion/Chase）；自动打电话 Agent | 对标 FluxOS/PAI/Iddu；单人不可维护                      |
| 页面     | production app 页面 token 迁移；五站全量 a11y audit                           | D 线只做共享 primitive + catalog                        |
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

Package 依赖表、提取决策矩阵、do-not-abstract 全表 → `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)`

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
| **C-P1+** 平台扩容   | 🟡 Finance 部分接入；低优先 | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)             |
| **D-P6** 设计系统    | ⏳ 窄范围 a11y（Next）      | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                 |

### Portal 速览

| 项              | 状态                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| URL             | [https://portal.kenos.space](https://portal.kenos.space) ✅                     |
| Netlify         | `portal-ken`；含于 `./scripts/deploy-all-netlify.sh`                            |
| 代码            | Launcher 2×2 + `CommandPalette` + `PortalUnauth` 🟡                             |
| 待补（Week 1）  | Supabase `portal.kenos.space/**`；`core_*` DB check 含 `portal`                 |
| 待补（Week 3+） | G-P1–G-P3 读 `core_*`；G-P2 角标；见 [`roadmap/GROWTH.md`](./roadmap/GROWTH.md) |

---

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
| Netlify 五站                  | [`ops/netlify.md`](./ops/netlify.md)                                  |
| 契约                          | [`architecture/contracts.md`](./architecture/contracts.md)            |
| 事件 RFC                      | [`architecture/events-rfc.md`](./architecture/events-rfc.md)          |
| PWA / iOS                     | [`qa/pwa-ios.md`](./qa/pwa-ios.md)                                    |
| 文档地图                      | [`README.md`](./README.md) · [`MAINTENANCE.md`](./MAINTENANCE.md)     |
| Growth / Portal / 单 App 闭环 | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                            |
| 历史归档 / 分卷               | [`roadmap/`](./roadmap/README.md) · [`archive/`](./archive/README.md) |

## 维护约定（单人团队）

借鉴 [Plans](https://yrangana.github.io/Plans/) 与 solo roadmap 实践，本 repo 采用 **状态 hub + 深度分卷**：

1. **改优先级** → 只改本文 §Now / §Next / §Not doing
2. **发货** → 条目从 Now 移到 Shipped；细节写入 `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`（日期 + 一句摘要 + 可选 commit）
3. **阶段深挖** → 更新对应分卷（`INTEGRATION` / `PLATFORM` / `DESIGN` / `GROWTH`），**不要**把 Wave 历史堆回 hub
4. **每月**（或重大发布后）跑验收命令，更新 `last_verified` 与 Shipped 表
5. **新想法** 先入 Backlog 评估，未排期前不得进入 Now

_旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。_
