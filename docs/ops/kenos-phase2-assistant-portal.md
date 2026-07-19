---
title: Kenos Phase 2 Assistant / Today 与 Portal Strangler Runbook
owner: kenpan
last_verified: 2026-07-19
status: local-beta-in-progress-no-production-cutover
---

# Kenos Phase 2 Assistant / Today 与 Portal Strangler Runbook

## 当前授权

允许本地开发、测试和提交 Assistant / Today 产品迁移；不允许生产 migration、writer cutover、Portal 默认域切换或 redirect、deploy、DNS、旧路径删除和数据回填。

## 第一切片

| Surface | 本地实现 | 数据/动作边界 |
| --- | --- | --- |
| Today `/` | 现有 Portal summary 的只读 read model；状态、下一步、待决定、Activity、Spaces | 不成为领域真源；行动回到对应 Space |
| Assistant `/assistant` | 原 AIOS chat 原样保留 | LLM 仍只能产出建议/Action；生产 executor 未接线 |
| Inbox `/inbox` | Capture/待分类操作面 | 当前 production adapter 为空；本地 demo 不持久化到领域 |
| Approvals `/approvals` | 显示 risk、action type、影响与来源 | 本地按钮只改 session demo 状态，不调用 command handler |
| Activity `/activity` | 显示成功、失败、数据安全说明与 retry affordance | production reader/worker 未接线；不复制敏感 payload |
| Portal | 实验 launcher + command-palette deep links | 不改默认 app、设置、RPC、auth、redirect 或写入 |

## Strangler 顺序

```text
local UI beta
-> read-only fixture/integration adapters
-> Today parity evidence
-> Inbox/Approval/Activity real-use evidence
-> production security/caller review
-> owner-approved shadow
-> owner-approved default entry switch
-> Portal read-only notice
-> redirect observation
-> old-path retirement
```

任何一步失败都回到上一个稳定入口；不得用双写代替 single-writer cutover。

## 生产前证据

- Today 与 Portal summary 字段、计数、时区和 freshness parity。
- 所有现役 Space 和旧 deep link 可达。
- Inbox 无丢失/重复；分类动作由目标 Owner 执行。
- Approval 绑定准确 payload/hash、auth strength、expiry 与 scope。
- Activity 对关键动作覆盖 100%，敏感字段经过 redaction，失败说明数据影响。
- shadow mismatch 阈值、样本量、观察窗口和回滚责任人由 owner 明确批准。
- hosted RLS/advisors、worker 身份、备份、变更窗口和部署审批完成。

## 回滚

第一切片回滚只需要恢复 AIOS 原根聊天入口，并移除 Portal 的实验 launcher/deep links。因为没有生产 schema、writer、default route、redirect 或部署变更，所以不需要数据回滚，也不得删除 Task、Activity 或 Outbox 数据。
