---
title: Life OS 复利判据
owner: kenpan
last_verified: 2026-07-18-endstate
doc_role: decision-framework
review_cadence: monthly
---

# 复利判据（使用 × 开发 × 决策）

> **用途：** 回答「这件事做完之后，明天会不会更值、以后会不会更便宜？」
> **排期真源仍是** [`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)；本文只提供取舍透镜。
> **ROI 排序证据** → [`POTENTIAL.md`](./POTENTIAL.md)
> **用量 / 利用率** → [`USAGE_AUDIT.md`](./USAGE_AUDIT.md)

## 一句话

复利不在「再做一个 app」，而在：**已有九个 OS 共享身份、事件、对象引用与 AIOS 工具面**；开发侧押 **CI、契约、生成器、测试护栏**；决策侧押 **真实用量与功能利用率**——不知道谁在被用，就会在死功能上堆债。

## 三层复利

| 层 | 问什么 | 高分信号 | 低分 / 负分 |
| --- | --- | --- | --- |
| **使用复利** | 每天打开是否更省事？数据是否越用越厚？ | 日用真源（Vault / 账本 / 扫描记忆）；跨 OS 一次写入多处生效；信任数字一致 | 无消费者的「智能」；凑 Portal 卡；新 app 无每日触点 |
| **开发复利** | 下一次同类改动是否更便宜、更安全？ | SSO / contracts / `life_events` / AppManifest / tokens+catalog / CI 绿 | app 互引；单消费者抽进共享包；远程领先 git；只靠手测的高速面 |
| **决策复利** | 我们是否知道该加码还是该砍？ | 第一方用量盘点；功能利用率表；死功能进 Not doing | 凭感觉排期；为「可能有用」保活整条面；上 SaaS 分析中台 |

单人 Life OS 没有万人漏斗——**自己的使用痕迹就是产品真源**。用量审计不是增长黑客，是**防表面积爆炸**的护栏。

## 已过临界点的底座（继续消费，少重复造）

| 资产 | 复利形态 |
| --- | --- |
| SSO + `coreIdentity` | 新 app 几乎零成本接登录 |
| `@life-os/contracts` + 边界守卫 | 联邦制不塌；改契约一次多端受益 |
| `life_events` outbox | 每多一种事件 + 一个消费端，跨 OS 价值指数涨 |
| `core_*` / Portal 今日摘要 | 一次写入、多处只读；Portal 是每日放大器 |
| AppManifest / `create`+`promote` / 生成注册表 | 新 app 接线幂等；Health / Knowledge / AIOS 已吃红利 |
| `@life-os/mcp-server` + MCP 面 | Home `where_is` + Planner 任务 CRUD + Finance 结余/支出 + Fitness 今日/恢复度；AIOS 一键舰队。鉴权已抽（`PLAT.MCP.0`）|
| Design tokens + Catalog | 九品牌一致性 + 像素回归 |
| CI 绿 | **复利开关**——红了之后所有后续交付都在打折 |
| **用量信号（分散但已存在）** | `last_opened_at` · `play_events` · Home diagnostics / events · Finance/Planner 业务表 —— 先盘点再补埋点 |

## 高复利押注（战略序，非即时排期）

```text
决策侧（排期质量往上弯）
  PLAT.USAGE.0 第一方利用率审计
  → 死功能冻结/删除 · 日用缺口抬升 ROI
  → 重大「要不要做 X」前先看表

使用侧（价值曲线往上弯）
  信任数字（Finance closure）
  → 每日真源（Knowledge watcher · Home 安静扫描记忆）
  → 跨 OS 消费（MCP / life_events / object_ref）
  → AIOS 当推理内核（先护栏，再扩工具）
  （停手条件写在 apps/* §终局；排期仍过下方四问）

开发侧（成本曲线往下弯）
  CI 绿 → contracts/events → AppManifest 生成器 → DS catalog → E2E 护栏

北极星复利（长期最大）
  object_ref + 通用时间线 —— 一件事只记一次
```

## 假复利 / 负复利（默认不做）

| 项 | 为什么是负分 |
| --- | --- |
| 第 10/11 个产品 app、Portal 硬凑卡 | 表面积↑、日用触点不涨 |
| `HOME.PROJ.7` 多项目 / 完整项目云同步（无第二真实项目时） | 冲突模型成本爆炸 |
| `KNOW.SYNC.1` Vault 原文上云（watcher 未稳前） | 隐私 + 冲突未闭环 |
| `INTG.EVENTS.2` 无消费者智能推荐 | 事件噪音 |
| 合并业务表 / app 互引 | 破坏边界守卫 |
| 单 app 私有壳层进 `packages/theme` | 共享包变坟场（music-shell 教训） |
| 全站页面级 token 迁移 / Figma-first | 单人不可维护；catalog 已够 |
| **第三方 analytics / 全路由埋点 / 远程 feature flag** | 单用户过度设计；决策复利用第一方盘点即可 |

## 入 Now 前四问

1. **使用：** 完成后，哪一个每日触点会明显变好？若答不上来，多半是线性功能。
2. **开发：** 完成后，下一次同类工作是否更短、更不易回归？若只会加表面积，后移。
3. **完整：** 远程 / 工作区 / CI 是否有漂移？有则先闭环真源，再叠功能。
4. **用量：** 相关功能最近是否真被用过？未知则先记入 [`USAGE_AUDIT.md`](./USAGE_AUDIT.md) 缺口，争议大时先跑盘点再开干。

与 hub §Not doing、[`BACKLOG.md`](./BACKLOG.md) 提取矩阵互补；冲突时以 hub 为准。
