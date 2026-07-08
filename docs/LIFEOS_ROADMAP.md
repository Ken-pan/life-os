---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-08
review_cadence: monthly
doc_role: status-hub
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → `[roadmap/](./roadmap/README.md)`

## 一句话

Life OS 是 **五站互通的个人生活平台**（Planner / Fitness / Finance / Music + Portal 启动器），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

### Now — 当前在飞


| ID        | 主题           | 阻塞 / 下一步                                                    | 验收                                                            |
| --------- | ------------ | ----------------------------------------------------------- | ------------------------------------------------------------- |
| **I-P0**  | SSO 跨域体验     | 代码已有；需生产 E2E（Finance 登录 → Planner 免登）                       | `./scripts/verify-life-os-identity-p0.sh`                     |
| **I-P1**  | Portal 产品收尾  | Auth redirect 显式加域；DB constraint 扩 `portal`；Launcher/PWA QA | 手动访问 [https://portal.kenos.space](https://portal.kenos.space) |
| **C-P1+** | Finance 契约补齐 | React 栈共享 UI 仍缺；`contracts/events` 已接，nav mirror 未做         | `npm run check:lifeos-boundaries`                             |
| **P2 债**  | `schema.sql` | `core_`* 仍仅在 migration，未 merge canonical 快照                 | 见 `[SUPABASE.md](./SUPABASE.md)`                              |


### Next — 已排期（D-P5 ✅ 之后）


| ID           | 主题                                                          | 触发条件                             |
| ------------ | ----------------------------------------------------------- | -------------------------------- |
| **D-P6**     | a11y gates（contrast / focus / target size / reduced motion） | 下一活跃 Design 项                    |
| **C-P2 P2+** | Finance React 共享 UI / i18n 决策                               | 出现第 3 个 React 消费者或 Finance 主动重构时 |


### Shipped — 近期已落地（摘要）


| 主线          | 摘要                                                          | 详情                                                   |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅ | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md)` |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                             | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`       |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）      | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`           |
| Portal      | `portal.kenos.space` 上线；Turbo CI build ✅                    | §Portal 速览                                           |
| CI          | design-catalog smoke + snapshots 进 GHA                      | `.github/workflows/ci.yml`                           |


完整发货记录与 commit 锚点 → `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`

### Parked — 搁置 / 实验


| ID                   | 说明                                          |
| -------------------- | ------------------------------------------- |
| **I-P2** 跨应用智能       | 依赖更多 `life_events` 消费端                      |
| **H-P0** `apps/home` | 户型/储藏 spatial WIP；本地 build ✅；**未部署、未接 SSO** |


---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：


| 类别   | 不做的事                                      | 原因                                                  |
| ---- | ----------------------------------------- | --------------------------------------------------- |
| 工具链  | Jira / ProductPlan / 重型 PM SaaS           | 单人团队；repo 内 Markdown 即真源                            |
| 设计流程 | Storybook-first / **Figma / Figma-first** | 无 Figma；已定 token-first + design-catalog             |
| 架构   | 合并各 app 业务表；app 互引                        | 边界硬规则                                               |
| 抽象   | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件        | 见 `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)` §不提取 |
| 产品   | Home OS 生产部署；I-P2 智能推荐                    | Home 实验性；I-P2 无消费者                                  |
| 页面   | production app 页面 token 迁移                | D 线只做共享 primitive + catalog                         |


---

## 架构不变量（Present）

```text
严格边界 · 统一身份 · 事件驱动 · 受控互通
```


| 规则         | 要点                                                              |
| ---------- | --------------------------------------------------------------- |
| 依赖         | `@life-os/contracts` 为根；`apps/*` **禁止**互引                       |
| 数据         | 业务表各 app 自有；跨 app 走 `core_*` 或 `life_events`                    |
| 身份         | `auth.uid()` + `.kenos.space` 跨子域 Cookie（`setupCrossDomainSSO`） |
| 设计         | `packages/design-tokens` → generated CSS；catalog 只做 preview     |
| Package 方向 | `contracts` ← `platform-web` ← `apps`；`theme` / `sync` 侧向共享     |


Package 依赖表、提取决策矩阵、do-not-abstract 全表 → `[roadmap/BACKLOG.md](./roadmap/BACKLOG.md)`

契约白名单 → `[LIFEOS_CONTRACTS.md](./LIFEOS_CONTRACTS.md)`

---

## 主线速览

命名：`I-*` Integration · `C-*` Platform/Contracts · `D-*` Design · `H-*` Home 实验


| 主线              | 当前状态                     | 深度文档                                                       |
| --------------- | ------------------------ | ---------------------------------------------------------- |
| **I-P0** 统一身份   | 🟡 已落地，SSO 待 E2E         | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p0)`  |
| **I-P1** Portal | 🟡 已上线，收尾中               | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p1)`  |
| **I-P1.5** 事件中心 | 🟡 outbox + Planner 消费 ✅ | `[roadmap/INTEGRATION.md](./roadmap/INTEGRATION.md#i-p15)` |
| **C-P1+** 平台扩容  | 🟡 Finance 部分接入          | `[roadmap/PLATFORM.md](./roadmap/PLATFORM.md)`             |
| **D-P6+** 设计系统  | ⏳ a11y 下一项               | `[roadmap/DESIGN.md](./roadmap/DESIGN.md)`                 |


### Portal 速览


| 项       | 状态                                                            |
| ------- | ------------------------------------------------------------- |
| URL     | [https://portal.kenos.space](https://portal.kenos.space) ✅    |
| Netlify | `portal-ken`；含于 `./scripts/deploy-all-netlify.sh`             |
| 代码      | Launcher 2×2 + `CommandPalette` + `PortalUnauth` 🟡           |
| 待补      | Supabase `portal.kenos.space/**`；`core_*` DB check 含 `portal` |


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

**CI（`.github/workflows/ci.yml`）：** `validate:tokens` + Turbo `build`；独立 job 跑 design-catalog smoke + snapshots。**未进 CI：** `check:lifeos-boundaries`、identity/outbox smoke（本地或后续补 GHA）。

## 运维索引


| 主题                         | 文档                                                                    |
| -------------------------- | --------------------------------------------------------------------- |
| Supabase 迁移 / `schema.sql` | `[SUPABASE.md](./SUPABASE.md)`                                        |
| Netlify 五站                 | `[NETLIFY.md](./NETLIFY.md)`                                          |
| 契约                         | `[LIFEOS_CONTRACTS.md](./LIFEOS_CONTRACTS.md)`                        |
| 事件 RFC                     | `[LIFEOS_EVENTS_RFC.md](./LIFEOS_EVENTS_RFC.md)`                      |
| PWA / iOS                  | `[DEBUG_PWA_IOS.md](./DEBUG_PWA_IOS.md)`                              |
| 历史归档 / 分卷                  | `[roadmap/](./roadmap/README.md)` · `[archive/](./archive/README.md)` |


## 维护约定（单人团队）

借鉴 [Plans](https://yrangana.github.io/Plans/) 与 solo roadmap 实践，本 repo 采用 **状态 hub + 深度分卷**：

1. **改优先级** → 只改本文 §Now / §Next / §Not doing
2. **发货** → 条目从 Now 移到 Shipped；细节写入 `[roadmap/SHIPPED.md](./roadmap/SHIPPED.md)`（日期 + 一句摘要 + 可选 commit）
3. **阶段深挖** → 更新对应分卷（`INTEGRATION` / `PLATFORM` / `DESIGN`），**不要**把 Wave 历史堆回 hub
4. **每月**（或重大发布后）跑验收命令，更新 `last_verified` 与 Shipped 表
5. **新想法** 先入 Backlog 评估，未排期前不得进入 Now

*旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。*