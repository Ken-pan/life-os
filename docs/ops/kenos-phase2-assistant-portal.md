---
title: Kenos Phase 2 Assistant / Today 与 Portal Strangler Runbook
owner: kenpan
last_verified: 2026-07-19
status: partial-pass-with-explicit-read-model-blockers
---

# Kenos Phase 2 Assistant / Today 与 Portal Strangler Runbook

## 当前授权

允许本地开发、测试和提交 Assistant / Today 产品迁移；不允许生产 migration、writer cutover、Portal 默认域切换或 redirect、deploy、DNS、旧路径删除和数据回填。

## 只读集成现状

| Surface | 本地实现 | 数据/动作边界 |
| --- | --- | --- |
| Today `/` | `public.portal_today_summary` 只读 RPC；状态、下一步、待决定、Activity、Spaces | 不成为领域真源；保留 Owner/source/freshness/deep link；行动回到对应 Space |
| Assistant `/assistant` | 原 AIOS chat 原样保留 | LLM 仍只能产出建议/Action；生产 executor 未接线 |
| Inbox `/inbox` | 只读 `public.life_events` pending 与 `public.planner_tasks` EntityRef projection；多源排序、去重、截断 | 不提供 Executor；部分源失败显示 partial；本地 demo 只有 `?kenosDemo=1` 显式开启 |
| Approvals `/approvals` | 未部署 canonical Approval read model，显示 unsupported | fail closed；不用 `life_events`/Outbox 冒充 Approval；本地按钮只改 session rehearsal，不调用 command handler |
| Activity `/activity` | 只读现有 `public.life_events` 兼容 event 来源 | 去重、截断、未知类型降级、敏感字段 redaction；不声称它是 Phase 1 canonical Activity table |
| Portal | 默认 Off 的实验 launcher + command-palette deep links | 本地 `?kenos=1` 可验证；production-like host 仅接受显式 build flag；不改默认 app、设置、RPC、auth、redirect 或写入 |

Verdict: `PARTIAL_PASS_WITH_EXPLICIT_READ_MODEL_BLOCKERS`。Today、Inbox 和 Activity 的 Green 只读工作已完成；真实 Approval 源是唯一明确 read-model blocker，不得为了变绿而伪造。

## 状态与降级

Read adapters 统一显示 `loading / ready / empty / partial / stale / offline / unavailable / permission_denied / unsupported`。各源独立 settle，慢源不阻塞已就绪源；离线和权限失败不会回退到伪生产数据。缓存只用于已读取投影的安全 stale 降级。

Shadow diagnostics 仅比较 redacted fingerprint，分类 `missing_in_new / extra_in_new / owner_mismatch / status_mismatch / freshness_mismatch / deep_link_mismatch / redaction_mismatch / unsupported_source`；输出 blocking/warning/expected，不记录原 payload。

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
