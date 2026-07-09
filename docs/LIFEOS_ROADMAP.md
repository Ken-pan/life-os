---
title: Life OS Roadmap
owner: kenpan
last_verified: 2026-07-09
review_cadence: monthly
doc_role: status-hub
priority_model: 2026-07-09-per-app-roadmaps
---

# Life OS Roadmap

> **读这份文档要回答三件事：** 现在在做什么？接下来做什么？明确不做什么？
>
> 详细阶段史、Wave 完成记录、提取决策矩阵 → [`roadmap/`](./roadmap/README.md)
> **六 app 产品排期** → [`roadmap/apps/`](./roadmap/apps/README.md)
>
> **优先级依据（2026-07-09）：** 潜力研判见 [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md) — **F-P3 信任锚点** → **G-P4b-M / M-P2** → **CI 接线** → 条件跨站 FT-P1。

## 一句话

Life OS 是 **六 app 个人生活平台**（Planner / Fitness / Finance / Music 四生产站 + Portal 启动器 + **Home 实验**），通过共享身份、事件总线和设计 token 保持各 app 独立又一致。

## 状态面板（每周扫一眼）

图例：✅ 完成 · 🟡 进行中 · ⏳ 已排期 · ⏸️ 搁置 · ❌ 未开始

**性价比标签：** 🔥 最高 · ◆ 高 · ○ 按需 · ✗ 暂缓

### Now — 当前在飞（按推荐顺序）

| 序  | ID  | 主题 | 桶  | ROI | 下一步 | 验收 |
| --- | --- | ---- | --- | --- | ------ | ---- |

**2026-07-09 已验收（见 §Shipped）：** G-P4 今日摘要 ✅ · H-P1/H-P2/H-P3 ✅ · F-P0 · F-P1 · G-P2 · M-P2 ✅ · I-P0 · M-P1 · AppBrandSwitcher ✅。

### Next — 已排期

| ID           | 主题                                       | App     | 桶       | ROI | 触发 / 范围                                   |
| ------------ | ------------------------------------------ | ------- | -------- | --- | --------------------------------------------- |
| **F-P3**     | Safe-to-spend / Scenarios / Spend 抽屉对齐 | Finance | Core     | 🔥  | audit Critical；**潜力 #1** — 见 POTENTIAL.md |
| **G-P4b-M**  | Portal 摘要扩 **Music** 卡                 | Portal  | Growth   | ◆   | `play_events` 已可读；~1d · **潜力 #2**       |
| **P-P2**     | Planner Insight 批量排期 E2E（P-1）        | Planner | Core     | ◆   | QA-P2 desktop 21/22 ✅ 后剩余项               |
| **I-P1.5b**  | Fitness 完练 → Planner 打卡                | Fitness | Growth   | ○   | **每天用两站** · FT-P1 · 潜力 #4              |
| **G-P4b-H**  | Portal 摘要 Home 储藏卡                    | Portal  | Growth   | ○   | 阻塞：先 **H-P6a** 元数据                     |
| **C-P2 P2+** | Finance React 共享 UI                      | Finance | Platform | ✗   | 第 3 React 消费者前不做                       |
| **C-P1+**    | Finance nav contracts mirror               | Finance | Platform | ✗   | `contracts/events` 已够                       |

分 app 细节 → [`roadmap/apps/`](./roadmap/apps/README.md) · Growth / Home Integration → [`roadmap/GROWTH.md`](./roadmap/GROWTH.md) · [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)

### 推荐执行顺序（2026-07-09 潜力研判 · 单人）

研判全文 → [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)

```text
Phase 0 — 信任锚点（#1 潜力）
  F-P3   STS / Scenarios / Spend 抽屉 + 回归测试

Phase 1 — 快赢 + 防回归（可并行）
  G-P4b-M  Portal Music 第四卡
  M-P2     Music UI E2E
  P-P2     Insight E2E（P-1）

Phase 1b — CI 复利（可选并行）
  Finance qa:ia-routes + Planner desktop → ci.yml

Phase 2 — 基础设施
  FT-P0  Fitness E2E 确认

Phase 3 — 条件跨站
  FT-P1 / I-P1.5b
  G-P4b-H（先 H-P6a）

Phase 4 — 按需
  D-P7 · 各 app §Parked

已完成（2026-07-09）
  F-P0 route smoke 22/22 ✅ · QA-P2 desktop 21/22 ✅
  G-P4 · H-P1/H-P2/H-P3 · F-P1 / G-P2 / I-P0 / M-P1 / AppBrandSwitcher ✅
```

**已完成（2026-07-08 四轮计划）：** I-P1 redirect/DB · P2 `schema.sql` · CI-补 · QA-F0 · G-P1–G-P3 · G-P5 · M-P1/F-P1 代码 · AppBrandSwitcher — 详情 [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)。

### Shipped — 近期已落地（摘要）

| 主线        | 摘要                                                                           | 详情                                                      |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Integration | `core_profiles` 远程 ✅；`life_events` outbox + Planner inbox ✅               | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md)      |
| Platform    | C-P0–C-P1 ✅；C-P2 Wave 1–3 P1+ ✅                                             | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)            |
| Design      | D-P0–D-P5 ✅（tokens + catalog 172 smoke / 80 snapshots）                      | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                |
| Integration | I-P0 生产 SSO E2E ✅；H-P2/H-P3 Home SSO + redirect ✅                         | [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)              |
| Growth      | G-P4 Portal 今日摘要 ✅；G-P2/F-P1/M-P1 生产验收 ✅                            | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                |
| Integration | I-P1 Portal DB + redirect · P2 `schema.sql` · G-P1–G-P3 · G-P5 · CI-补 · QA-F0 | [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)              |
| Portal      | `portal.kenos.space` 读 `core_*`（继续/默认跳转/角标/今日摘要/PWA 引导）       | `apps/portal`                                             |
| Platform    | AppBrandSwitcher 六站侧栏跨 app 切换（Svelte + Finance React 薄壳）            | `packages/platform-web` · `packages/theme/launcher.js`    |
| Home        | `home.kenos.space` 生产；SSO + PWA + 平面 UX ✅（H-P5）；H-P4 云同步搁置       | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0) |
| CI          | build + design-catalog（smoke/a11y/snapshots）+ integration-smoke 进 GHA       | `.github/workflows/ci.yml`                                |

完整发货记录与 commit 锚点 → [`roadmap/SHIPPED.md`](./roadmap/SHIPPED.md)

### Parked — 搁置 / 实验

| ID                    | 说明                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **I-P2** 跨应用智能   | 依赖更多 `life_events` 消费端                                                                |
| **H-P0** `apps/home`  | 第六 app · 户型/储藏 spatial；`/plan` 浏览+编辑；`home.kenos.space` 已部署；Portal 实验卡 ✅ |
| **H-P4** Home 云同步  | spatial 项目 Supabase 持久化（现 `localStorage` only）                                       |
| **H-P5** Home 平面 UX | 浏览/编辑双模式；`plan-viewport` + `test:viewport` 验收 ✅（2026-07-08）                     |

---

## Not doing（防止 scope creep）

直到对应阶段触发，**明确不做**：

| 类别     | 不做的事                                                                      | 原因                                                    |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 工具链   | Jira / ProductPlan / 重型 PM SaaS                                             | 单人团队；repo 内 Markdown 即真源                       |
| 设计流程 | Storybook-first / **Figma / Figma-first**                                     | 无 Figma；已定 token-first + design-catalog             |
| 架构     | 合并各 app 业务表；app 互引                                                   | 边界硬规则                                              |
| 抽象     | `sync.js` 引擎、`nav.js` 内容、业务 Row 组件                                  | 见 [`roadmap/BACKLOG.md`](./roadmap/BACKLOG.md) §不提取 |
| 产品     | Home 升四站同级（云同步、默认 Launcher、life_events）                         | Home 实验性；H-P4 搁置；H-P5 平面 UX ✅；H-P2/3 SSO ✅  |
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

命名：`I-*` Integration · `C-*` Platform · `D-*` Design · `G-*` Growth · `P-P*`/`QA-P*` Planner · `FT-P*` Fitness · `F-P*` Finance · `M-P*` Music · `H-P*` Home

| 主线                 | 当前状态                                            | 深度文档                                                   |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| **I-P0** 统一身份    | ✅ 生产 E2E（2026-07-09）                           | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p0)  |
| **I-P1** Portal      | ✅ 已上线；Growth G-P1–G-P5 已接                    | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p1)  |
| **I-P1.5** 事件中心  | ✅ 管道通；I-P1.5b 按需                             | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#i-p15) |
| **G-P1–G-P5** Growth | ✅ 生产验收完成（含 F-P1/G-P2）                     | [`roadmap/GROWTH.md`](./roadmap/GROWTH.md)                 |
| **H-P0** Home 实验   | 🟡 已部署；SSO + PWA ✅；H-P5 平面 UX ✅；H-P4 搁置 | [`roadmap/INTEGRATION.md`](./roadmap/INTEGRATION.md#h-p0)  |
| **C-P1+** 平台扩容   | 🟡 Finance 部分接入；低优先                         | [`roadmap/PLATFORM.md`](./roadmap/PLATFORM.md)             |
| **D-P6** 设计系统    | ✅ catalog a11y gates（2026-07-08）                 | [`roadmap/DESIGN.md`](./roadmap/DESIGN.md)                 |

### 六 app 一览

| App     | 层级   | URL                                                | Workspace    | SSO | Portal | Top Next（→ 分卷）                       |
| ------- | ------ | -------------------------------------------------- | ------------ | --- | ------ | ---------------------------------------- |
| Planner | 生产   | [planner.kenos.space](https://planner.kenos.space) | `planner-os` | ✅  | ✅     | **P-P2** Insight（QA-P2 21/22 ✅）       |
| Fitness | 生产   | [fitness.kenos.space](https://fitness.kenos.space) | `fitness-os` | ✅  | ✅     | **FT-P0** E2E · FT-P1 条件               |
| Finance | 生产   | [finance.kenos.space](https://finance.kenos.space) | `finance-os` | ✅  | ✅     | **F-P3** 信任锚点                        |
| Music   | 生产   | [music.kenos.space](https://music.kenos.space)     | `music-os`   | ✅  | ✅     | **M-P2** E2E · **M-P5** 行为分           |
| Portal  | 启动器 | [portal.kenos.space](https://portal.kenos.space)   | `portal`     | ✅  | —      | **G-P4b-M** Music 卡 · G-P6              |
| Home    | 实验   | [home.kenos.space](https://home.kenos.space)       | `home-os`    | ✅  | ✅     | **H-P6a** 元数据 · **H-P7** 多项目 local |

**分卷：** [`roadmap/apps/`](./roadmap/apps/README.md) · 插件：Finance OS Sync — `apps/finance/extension`

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
| **六 app 产品排期**           | [`roadmap/apps/`](./roadmap/apps/README.md)                           |
| **潜力研判（ROI 排序）**      | [`roadmap/POTENTIAL.md`](./roadmap/POTENTIAL.md)                      |
| 历史归档 / 分卷               | [`roadmap/`](./roadmap/README.md) · [`archive/`](./archive/README.md) |

## 维护约定

详见 [`MAINTENANCE.md`](./MAINTENANCE.md)。Hub 只维护 §Now / §Next / §Shipped / §Not doing；阶段史与证据写入 `roadmap/` 分卷。

_旧版单文件长篇阶段史已拆分至 `docs/roadmap/`（2026-07-08 结构优化）。_
