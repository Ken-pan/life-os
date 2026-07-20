---
title: Life OS 用量与功能利用率审计
owner: kenpan
last_verified: 2026-07-18-usage0c
doc_role: decision-evidence
review_cadence: monthly
---

# 用量与功能利用率审计

> **为什么是复利：** 不知道哪个功能真被用，就会在死功能上继续堆代码，在日用缺口上欠账。单人 Life OS 没有「万人漏斗」——**自己的使用痕迹就是产品真源**。
> **排期：** hub `PLAT.USAGE.0` · 透镜 [`COMPOUND.md`](./COMPOUND.md) §决策复利
> **不做：** Mixpanel / PostHog / 多租户 feature flag SaaS（单用户过度设计，见 extraction audit）。做**第一方信号盘点 + 定期利用率表**。

## 目标

每月（或重大排期前）能回答：

1. 九个 app 里，**最近 7 / 30 天**哪些在被打开？
2. 每个 app 的**核心功能**有没有真实写入/完成痕迹？
3. 哪些入口 / 页面 / 实验能力是**零利用**——候选删减或冻结，而不是继续迭代？

## 已有信号（先消费，少新建）

| 信号 | 位置 | 能回答什么 |
| --- | --- | --- |
| `core_user_app_settings.last_opened_at` | Portal「继续」· sync `touchAppLastOpened` | 跨站打开频次 / 最近活跃 app |
| `portal_today_summary` / `core_*` | Portal 摘要卡 | 今日任务 / 训练 / 结余 / Music / Home 是否有可读数据 |
| `music.play_events` · `recommendation_events` | Music | 播放与推荐是否在喂学习环 |
| `home.events` · `meta.scanDiagnostics` | Home | 整理动作、扫描质量、打扰是否下降 |
| Finance 交易 / 审核状态分布 | Finance RPC + History | 审核队列是否在缩；STS 是否被打开 |
| Planner 任务完成 / 日程写入 | Planner + life_events 消费 | Today / Schedule 是否日用 |
| Knowledge `analytics.js` 快照 | Knowledge 本地 | 笔记增长 / 标签热度（Vault 侧） |
| Fitness session / workout_logged | Fitness → Planner | 完练是否真正发生 |

缺口（按需补，默认 SQL / 脚本，不上埋点中台）：

- 多数 app **无路由级**停留记录（不必一上来做；先用业务表代理）
- ~~AIOS / HealthOS / Knowledge 本地优先无信号~~ → **PLAT.USAGE.0c** 已补：Vault `.md` mtime · Health Focus jsonl；AIOS 仍靠云 `aios.*` 表
- 功能入口「打开但未完成」目前大多看不见——只在争议功能上加极薄计数

## 利用率矩阵（模板）

复制到当月笔记或 `docs/qa/usage-audit-YYYY-MM.md`（证据，非计划真源）：

| App | 核心功能 | 证据查询 / 路径 | 7d | 30d | 判定 |
| --- | --- | --- | --- | --- | --- |
| Portal | 打开 / 继续 | `last_opened_at` 排序 | | | 日用 / 偶发 / 死 |
| Planner | Today 完成 | tasks completed today | | | |
| Planner | Schedule | 日程写入 / E2E 外真实使用 | | | |
| Finance | History 审核 | review→confirm 次数 | | | |
| Fitness | 完练 | `fitness.workout_logged` / sessions | | | |
| Music | 播放 | `play_events` count | | | |
| Home | 扫描 / 认亲 | scans + diagnostics | | | |
| Home | Storage / tidy | `home.events` | | | |
| Knowledge | 编辑 / recall | Vault mtime + analytics | | | |
| AIOS | chat / 简报 | 本地会话痕迹 | | | |
| Health | Focus / companion | 本地 + Watch 同步 | | | |

**判定口径：**

- **日用** — 7d 内多次 → 护栏与 UX 优先
- **偶发** — 30d 有痕迹 → 维护级，不抢主线
- **死** — 30d+ 零痕迹且无外部依赖 → 删入口 / 归档文档 / 停迭代
- **未知** — 无信号 → 先补最小代理指标，再决定投不投

## `PLAT.USAGE.0` 最小闭环

1. **盘点脚本或 SQL 清单**（`scripts/` 或 `docs/qa/`）：对上表「已有信号」跑一遍，输出 Markdown 表。
2. **第一版审计报告**写入 `docs/qa/usage-audit-YYYY-MM.md`。
3. **反哺 hub：** 死功能进 §Not doing / 分卷 Parked；日用缺口抬升 ROI（写进 `POTENTIAL.md`）。
4. **节奏：** 与 hub `last_verified` 同周或每月一次；重大「要不要做 X」决策前加跑。

验收：Ken 能凭报告删掉或冻结至少一项低利用表面，或把一项日用缺口提进 Now——**审计本身要产生决策，不是仪表盘玩具。**

## 与「不做 analytics」的边界

| 做 | 不做 |
| --- | --- |
| 第一方表 / 本地日志盘点 | 第三方产品分析 SaaS |
| 月度利用率表 + 删减建议 | 实时多维漏斗、A/B、远程 feature flag |
| 争议功能上的极薄计数 | 全路由 pageview 海量埋点 |
| 隐私：owner 自用、可删 | 跨用户画像、外发遥测 |

## 相关

- [`COMPOUND.md`](./COMPOUND.md) · [`POTENTIAL.md`](./POTENTIAL.md) · [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)
- 已有管道：[`GROWTH.md`](./GROWTH.md) Music/Portal · Home `scanDiagnostics` · Knowledge `analytics.js`
