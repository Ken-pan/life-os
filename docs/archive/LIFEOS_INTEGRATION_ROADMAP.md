# Life OS Integration Roadmap

> **四站互通主线**：统一身份 → 统一入口 → 共享事件层 → 跨 App 智能互通
> 与 **Shared Platform** 主线（contracts / platform-web）并行，互不替代。

**文档入口：** [`README.md`](./README.md)

---

## 两条主线，不要混用「P0 / P1」

| 主线                | 目标                                   | 代表文档                                                    | 当前阶段                  |
| ------------------- | -------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| **Integration**     | 四 App 同账号、Portal、数据受控互通    | 本文 + [`LIFE_OS_IDENTITY_P0.md`](./LIFE_OS_IDENTITY_P0.md) | Identity **INTG.IDENTITY.0** ✅      |
| **Shared Platform** | 跨 surface 契约、web adapter、边界守卫 | [`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md)                  | Contracts **PLAT.CONTRACTS.1** 进行中 |

命名约定（写 PR / issue / 记忆时用这个）：

- **INTG.IDENTITY.0** = Integration Identity P0（共享身份骨架）
- **INTG.EVENTS.1** = Portal / App Launcher
- **INTG.EVENTS.1.5** = `life_events` 事件层
- **INTG.EVENTS.2** = 跨 App 智能消费
- **C-P0 / PLAT.CONTRACTS.1** = Shared Platform contracts 试点（Planner/Fitness）

---

## 架构原则（Integration 全线适用）

```txt
统一身份
统一入口
统一事件
独立业务域
受控互通
```

**Hard rules：**

1. 不要先把 Finance / Music / Planner / Fitness 业务表合成一锅
2. 跨 App 可读数据走 **shared core** 或 **life_events**，不直接扫对方全量表
3. 所有用户数据表坚持 `auth.uid()` + RLS
4. 子域 ≠ 同源；**不要默认** localStorage session 自动共享

推荐选项：**Shared Supabase Auth + shared core tables**（见 INTG.IDENTITY.0），不是四 App 合成一个 SPA。

---

## 阶段总览

| 阶段       | 名称                          | 预计     | 状态                                                 | 详细文档                                                     |
| ---------- | ----------------------------- | -------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| **INTG.IDENTITY.0**   | Shared Identity Foundation    | 0.5–1 天 | ✅ 代码 + 迁移 + CLI 验收完成；⏳ 四站浏览器登录确认 | [`LIFE_OS_IDENTITY_P0.md`](./LIFE_OS_IDENTITY_P0.md)         |
| **INTG.EVENTS.1**   | Life OS Portal / App Launcher | 1–2 天   | 📋 待启动                                            | [`LIFEOS_PORTAL_P1.md`](./LIFEOS_PORTAL_P1.md)               |
| **INTG.EVENTS.1.5** | Shared Events (`life_events`) | ~1 天    | 📋 待 INTG.EVENTS.1 骨架稳                                    | [`LIFEOS_LIFE_EVENTS_P1_5.md`](./LIFEOS_LIFE_EVENTS_P1_5.md) |
| **INTG.EVENTS.2**   | Cross-App Intelligence        | 2–5 天起 | ⏸️ 待 INTG.EVENTS.1.5                                         | 本文 §INTG.EVENTS.2                                                   |
| —          | Apex `kenos.space` 首页       | 稍后     | ⏸️                                                   | Portal 稳定后再做                                            |

---

## INTG.IDENTITY.0 — Shared Identity Foundation ✅

**已完成（2026-07-08）：**

- `core_profiles` / `core_user_app_settings`
- 四站 `resolveSupabaseEnv` + `createCoreIdentityHandler`
- Supabase redirect URLs（17 条）+ Netlify env 四站 4/4
- `./scripts/verify-life-os-identity-p0.sh`

**INTG.IDENTITY.0 出口条件（进入 INTG.EVENTS.1 前）：**

- [x] 迁移 `20260707230000` 已应用
- [x] Supabase redirect URLs 已配置
- [x] 四站 custom domain SSL Ready
- [ ] 同一邮箱在四站登录，`core_profiles.id` 一致（浏览器手动验收）
- [x] 自动化脚本 `verify-life-os-identity-p0.sh` 通过

---

## INTG.EVENTS.1 — Portal / App Launcher 📋

**入口建议：** `home.kenos.space`（暂不碰 apex `kenos.space`）

**第一版模块：**

| 模块           | 内容                                           |
| -------------- | ---------------------------------------------- |
| App launcher   | Finance / Music / Planner / Fitness 四链       |
| Auth status    | 当前用户、登录状态、最后同步时间               |
| Today overview | 今日任务、预算状态、训练、音乐状态（只读摘要） |
| Quick actions  | 跨 App 快捷入口（先 stub，INTG.EVENTS.1.5 后接真数据）  |
| System health  | Supabase / Netlify / extension sync 状态       |

**依赖 INTG.IDENTITY.0：** `core_profiles`、`core_user_app_settings.last_opened_at`

→ 实施清单见 [`LIFEOS_PORTAL_P1.md`](./LIFEOS_PORTAL_P1.md)

---

## INTG.EVENTS.1.5 — `life_events` 事件层 📋

**目的：** 让 App 发布「可被别的 App 消费的事实」，而不是互相直读全量表。

**核心表：** `life_events`（`source_app`, `event_type`, `payload`, `visibility`）

**典型流：**

```txt
Finance → life_events: bill_due
Planner 消费 → 生成 task

Fitness → life_events: workout_completed
Planner 消费 → 完成 habit / 任务
```

→ 表结构、RLS、发布/消费约定见 [`LIFEOS_LIFE_EVENTS_P1_5.md`](./LIFEOS_LIFE_EVENTS_P1_5.md)

**启动条件：** INTG.EVENTS.1 Portal 能展示登录态 + App 状态；至少一个 App 能写 `last_opened_at`。

---

## INTG.EVENTS.2 — Cross-App Intelligence ⏸️

等 INTG.EVENTS.1 + INTG.EVENTS.1.5 稳了再做：

| 场景                 | 互通方式                    |
| -------------------- | --------------------------- |
| Finance → Planner    | 账单 / 订阅 / 还款日 → 任务 |
| Planner → Fitness    | 日程空档 → 训练时间建议     |
| Fitness → Planner    | 训练完成 → 更新任务 / habit |
| Music → Planner      | Focus playlist ↔ 时间块     |
| Music → Fitness      | Gym playlist ↔ 训练类型     |
| Finance → AI Context | 预算压力 → Planner 建议强度 |

**不做：** 合并前端、自建 SSO/BFF（除非产品阶段明确要求）。

---

## 与 Shared Platform（PLAT.CONTRACTS.1）如何并行

| 问题                                | 建议                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 先做 Portal 还是扩 contracts 试点？ | **Portal（INTG.EVENTS.1）优先** — 用户可感知；PLAT.CONTRACTS.1 继续按 [`LIFEOS_P1_PREP.md`](./LIFEOS_P1_PREP.md) 小步推进 |
| INTG.EVENTS.1 新 App 放哪？                  | 新 SvelteKit app `apps/portal` 或 `apps/home`，复用 `@life-os/theme` + `@life-os/sync`               |
| INTG.EVENTS.1.5 事件类型放哪？               | 先进 `@life-os/contracts`（纯类型），表在 Supabase `core_*` / `life_events`                          |
| Finance / Music 何时接 contracts？  | PLAT.CONTRACTS.1 仍 **Later**；Integration 不受阻，Portal 只读摘要即可                                           |

---

## 建议执行顺序（Next 3 steps）

1. **关闭 INTG.IDENTITY.0** — 四站各登录一次，勾选 [`LIFE_OS_IDENTITY_P0.md`](./LIFE_OS_IDENTITY_P0.md) §6 手动项
2. **启动 INTG.EVENTS.1** — 按 [`LIFEOS_PORTAL_P1.md`](./LIFEOS_PORTAL_P1.md) 建 `home.kenos.space`
3. **设计 INTG.EVENTS.1.5** — 在 Portal 需要跨 App 摘要时，先上 `life_events` 再让 Planner 消费 Finance 事件

---

## 相关脚本与配置

| 资源             | 路径                                         |
| ---------------- | -------------------------------------------- |
| Identity 验收    | `./scripts/verify-life-os-identity-p0.sh`    |
| SQL 执行         | `./scripts/supabase-sql.sh`                  |
| Auth redirect 源 | `apps/finance/supabase/config.toml` `[auth]` |
| 部署矩阵         | [`NETLIFY.md`](../NETLIFY.md)                 |

---

## 变更日志

| 日期       | 变更                                                      |
| ---------- | --------------------------------------------------------- |
| 2026-07-08 | 初版：INTG.IDENTITY.0 完成记录 + INTG.EVENTS.1 / INTG.EVENTS.1.5 / INTG.EVENTS.2 纳入 docs 主线 |
