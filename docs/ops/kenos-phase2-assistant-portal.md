---
title: Kenos Phase 2 Assistant / Today 与 Portal Strangler Runbook
owner: kenpan
last_verified: 2026-07-19
status: read-only-integration-ready-no-production-cutover
---

# Kenos Phase 2 Assistant / Today 与 Portal Strangler Runbook

## 当前授权

允许本地开发、测试和提交 Assistant / Today 产品迁移；Approval 边界仅按 `TEMPORARY_APPROVED_FOR_PHASE_2_APPROVAL_READ_MODEL` 执行。不允许真实 approve/reject、Executor、生产 migration/RLS、writer cutover、Portal 默认域切换或 redirect、deploy、DNS、旧路径删除和数据回填。

锁定口径保持不变：不允许生产 migration；不允许 writer cutover；不允许 Portal 默认域切换；不允许 deploy；不允许旧路径删除。

## 只读集成现状

| Surface | 本地实现 | 数据/动作边界 |
| --- | --- | --- |
| Today `/` | `public.portal_today_summary` 只读 RPC；状态、下一步、待决定、Activity、Spaces | 不成为领域真源；保留 Owner/source/freshness/deep link；行动回到对应 Space |
| Assistant `/assistant` | 原 AIOS chat 原样保留 | LLM 仍只能产出建议/Action；生产 executor 未接线 |
| Inbox `/inbox` | 只读 `public.life_events` pending 与 `public.planner_tasks` EntityRef projection；多源排序、去重、截断 | 不提供 Executor；部分源失败显示 partial；本地 demo 只有 `?kenosDemo=1` 显式开启 |
| Approvals `/approvals` | `public.kenos_list_action_approvals` 只读 RPC → Platform/System-owned projection | canonical v1 与 review-only table/RPC 已通过 disposable dual-user RLS/privilege test；Assistant 不写 Approval，不用 `life_events`/Outbox 冒充，不调用 Executor |
| Activity `/activity` | 只读现有 `public.life_events` 兼容 event 来源 | 去重、截断、未知类型降级、敏感字段 redaction；不声称它是 Phase 1 canonical Activity table |
| Portal | 默认 Off 的实验 launcher + command-palette deep links | 本地 `?kenos=1` 可验证；production-like host 仅接受显式 build flag；不改默认 app、设置、RPC、auth、redirect 或写入 |

Verdict: `LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY`（历史别名 `READ_ONLY_INTEGRATION_READY` 仅表示本地/disposable）。Today、Inbox、Approval 和 Activity 的本地只读边界已齐备。这是 repository/disposable-environment readiness，不是“已部署生产 Approval”；review-only SQL 不在 migration 目录，生产 apply/RLS/caller review 仍锁定。

## 状态与降级

Read adapters 统一显示 `loading / ready / empty / partial / stale / offline / unavailable / permission_denied`。Approval 记录还明确展示 `expired / superseded / unknown`，unknown fail closed。各源独立 settle，慢源不阻塞已就绪源；离线和权限失败不会回退到伪生产数据。缓存只用于已读取投影的安全 stale 降级。

Shadow diagnostics 仅比较 redacted fingerprint。通用分类保留 `missing_in_new / extra_in_new / owner_mismatch / status_mismatch / freshness_mismatch / deep_link_mismatch / redaction_mismatch / unsupported_source`；Approval 专用分类是 `missing_in_canonical / extra_in_canonical / action_mismatch / correlation_mismatch / owner_mismatch / risk_mismatch / status_mismatch / expiry_mismatch / redaction_mismatch / deep_link_mismatch / unsupported_legacy_source`。Portal badge 只与 canonical pending count 做脱敏 count-only shadow，不自动迁移为 Approval。

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
- Approval 生产评审确认 function owner、worker identity、fixed `search_path`、auth strength、expiry/supersession 与 Action binding。
- Activity 对关键动作覆盖 100%，敏感字段经过 redaction，失败说明数据影响。
- shadow mismatch 阈值、样本量、观察窗口和回滚责任人由 owner 明确批准。
- hosted RLS/advisors、worker 身份、备份、变更窗口和部署审批完成。

## 回滚

第一切片回滚只需要恢复 AIOS 原根聊天入口，并移除 Portal 的实验 launcher/deep links。Approval 读模型回滚是停用只读 RPC adapter、回到明示 unavailable，不 apply 或 drop review-only SQL。因为没有生产 schema、writer、default route、redirect 或部署变更，所以不需要数据回滚，也不得删除 Approval、Action、Task、Activity 或 Outbox 数据。
