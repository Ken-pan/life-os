---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-09
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

| 序  | ID       | 主题                 | 桶     | ROI | 下一步                         | 验收                          |
| --- | -------- | -------------------- | ------ | --- | ------------------------------ | ----------------------------- |

**2026-07-09 已验收（见 §Shipped）：** G-P4 今日摘要 ✅ · H-P1/H-P2/H-P3 ✅ · F-P1 · G-P2 · I-P0 · M-P1 · AppBrandSwitcher ✅。

### Next — 已排期

| ID           | 主题                                      | 桶       | ROI | 触发 / 范围                              |
| ------------ | ----------------------------------------- | -------- | --- | ---------------------------------------- |
| **D-P6**     | a11y gates                                | Infra    | ○   | **窄范围**：`platform-web` + catalog     |
| **I-P1.5b**  | Fitness 完练 → Planner 打卡               | Growth   | ○   | **须有每天用两站的场景**                 |
| **QA-P2**    | Planner desktop E2E                       | Infra    | ○   | FAB/侧栏对齐 desktop project             |
| **C-P2 P2+** | Finance React 共享 UI                     | Platform | ✗   | 第 3 React 消费者前不做                  |
| **C-P1+**    | Finance nav contracts mirror              | Platform | ✗   | `contracts/events` 已够                  |

Growth / Home 细节 → [`roadmap/GROWTH.md`](./roadmap/GROWTH.md) · [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)

### 推荐执行顺序（2026-07-09 后 · 单人）

```text
当前焦点 — 按需
  D-P6  窄范围 a11y
  I-P1.5b  Fitness → Planner（有场景再开）
  QA-P2  Planner desktop E2E

已完成（2026-07-09）
  G-P4 Portal 今日摘要 ✅（Planner / Finance / Fitness 三卡）
  H-P1 Portal Home 实验卡 ✅（portal.kenos.space 生产）
  H-P2 + H-P3 Home SSO ✅（home.kenos.space 跨域 Cookie + core_*）
  F-P1 / G-P2 / I-P0 / M-P1 / AppBrandSwitcher ✅
```

**已完成（2026-07-08 四轮计划）：** I-P1 redirect/DB · P2 `schema.sql` · CI-补 · QA-F0 · G-P1–G-P3 · G-P5 · M-P1/F-P1 代码 · AppBrandSwitcher — 详情 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)。

### Shipped — 近期已落地（摘要）

| 主线        | 摘要                                                                           | 详情                                                      |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅               | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md)      |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                                             | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)            |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）                      | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                |
| Integration | I-P0 生产 SSO E2E ✅；H-P2/H-P3 Home SSO + redirect ✅                         | [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)              |
| Growth      | G-P4 Portal 今日摘要 ✅；G-P2/F-P1/M-P1 生产验收 ✅                              | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                 |
| Integration | I-P1 Portal DB + redirect · P2 `schema.sql` · G-P1–G-P3 · G-P5 · CI-补 · QA-F0 | [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)              |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/今日摘要/PWA 引导）       | `apps/portal`                                             |
| Platform    | AppBrandSwitcher 六站侧栏跨 app 切换（Svelte + Finance React 薄壳）            | `packages/platform-web` · `packages/theme/launcher.js`    |
| Home        | `home.kenos.space` 生产；SSO + PWA + 平面 UX ✅（H-P5）；H-P4 云同步搁置        | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0) |
| CI          | build + design-catalog（smoke/a11y/snapshots）+ integration-smoke 进 GHA       | `.github/workflows/ci.yml`                                |

完整发货记录与 commit 锚点 → [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

### Parked — 搁置 / 实验

| ID                   | 说明                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **I-P2** 跨应用智能  | 依赖更多 `life_events` 消费端                                                                  |
| **H-P0** `apps/home` | 第六 app · 户型/储藏 spatial；`/plan` 浏览+编辑；`home.kenos.space` 已部署；Portal 实验卡 ✅ |
| **H-P4** Home 云同步 | spatial 项目 Supabase 持久化（现 `localStorage` only）                                         |
| **H-P5** Home 平面 UX | 浏览/编辑双模式；`plan-viewport` + `test:viewport` 验收 ✅（2026-07-08）                      |

---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：

| 类别     | 不做的事                                                                      | 原因                                                    |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 工具链   | Jira / ProductPlan / 重型 PM SaaS                                             | 单人团队；repo 内 Markdown 即真源                       |
| 设计流程 | Storybook-first / **Figma / Figma-first**                                     | 无 Figma；已定 token-first + design-catalog             |
| 架构     | 合并各 app 业务表；app 互引                                                   | 边界硬规则                                              |
| 抽象     | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                  | 见 [`roadmap/BACKLOG.md`](./roadmap/BACKLOG.md) §不提取 |
| 产品     | Home 升四站同级（云同步、默认 Launcher、life_events）                         | Home 实验性；H-P4 搁置；H-P5 平面 UX ✅；H-P2/3 SSO ✅       |
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

| 主线                 | 当前状态                               | 深度文档                                                   |
| -------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **I-P0** 统一身份    | ✅ 生产 E2E（2026-07-09）             | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p0)  |
| **I-P1** Portal      | ✅ 已上线；Growth G-P1–G-P5 已接       | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p1)  |
| **I-P1.5** 事件中心  | ✅ 管道通；I-P1.5b 按需                | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p15) |
| **G-P1–G-P5** Growth | ✅ 生产验收完成（含 F-P1/G-P2）        | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                 |
| **H-P0** Home 实验   | 🟡 已部署；SSO + PWA ✅；H-P5 平面 UX ✅；H-P4 搁置 | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)  |
| **C-P1+** 平台扩容   | 🟡 Finance 部分接入；低优先            | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)             |
| **D-P6** 设计系统    | ⏳ 窄范围 a11y（Next）                 | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                 |

### 六 app 一览

| App     | 层级   | URL                                                | Workspace    | SSO         | Portal      | 下一步 / 备注                        |
| ------- | ------ | -------------------------------------------------- | ------------ | ----------- | ----------- | ------------------------------------ |
| Planner | 生产   | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | ✅          | ✅ Launcher | 任务/日历/AI；`life_events` 消费端   |
| Fitness | 生产   | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | ✅          | ✅          | Focus 训练；QA-F0 端口债             |
| Finance | 生产   | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | ✅          | ✅          | 月度推演；**Chrome 扩展**同步        |
| Music   | 生产   | [music.kenos.space](https://music.kenos.space)     | `music-os`   | ✅          | ✅          | M-P1 `play_events` ✅（167 行）      |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space)   | `portal`     | ✅          | —           | G-P1–G-P5 ✅；读 `core_*` + PWA 引导 |
| Home    | 实验   | [home.kenos.space](https://home.kenos.space)       | `home-os`    | ✅          | ✅ 实验卡   | spatial 浏览/编辑；H-P4 云同步搁置   |

**插件（生产向，非第六 app）：** Finance OS Sync — `apps/finance/extension`（DOM 抓取 → 主站同步）

部署与 Site ID → [`ops/netlify.md`](./ops/netlify.md) · Portal → [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p1) · Home → [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)

## 验收命令

```bash
./scripts/verify-life-os-identity-p0.sh    # I-P0
./scripts/test-outbox-trigger.sh --smoke   # I-P1.5
npm run check:lifeos-boundaries            # C-P0
npm run test:viewport -w home-os           # H-P5 平面定位（需 dev/preview）
npm run validate:tokens                    # D 线 token 完整性
npm run test:design-catalog                # 172 smoke
npm run test:design-catalog:snapshots    # 80 pixel baselines
```

**CI（`.github/workflows/ci.yml`）：** 三 job — `build`（`validate:tokens` + Turbo `build`）· `design-catalog`（smoke + a11y + snapshots）· `integration-smoke`（`check:lifeos-boundaries` + outbox 结构 + 可选远程 identity/outbox smoke，需 `SUPABASE_ACCESS_TOKEN` secret）。

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
