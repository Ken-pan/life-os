---
title: Kenos 重构决策登记表
owner: kenpan
last_verified: 2026-07-18
doc_role: architecture-decision-register
status: active-for-phase-0
---

# Kenos 重构决策登记表

本表不代替详细 ADR，用于防止 review 中的“定案”被误解为“仓库已实现”。

## 状态

- `TARGET_APPROVED`: 目标方向已由最新 review 确认，实现/cutover 仍需 gate。
- `FREEZE_REQUIRED`: 实施前还需 owner 补充边界或取值。
- `CURRENT_INVARIANT`: 当前仓库已强制的规则。
- `IMPLEMENTED`: 已有代码、测试和必要远程证据。
- `RETIRED`: 不再适用且已删除兼容层。

## P0 决策

| ID | 决策 | 状态 | 实施前最后一步 | 证据/约束 |
| --- | --- | --- | --- | --- |
| KENOS-001 | 产品品牌为 Kenos，内部领域 ID 与用户文案分离 | TARGET_APPROVED | 冻结 ID 表和旧路由保留期 | 不做超级 rename |
| KENOS-002 | Assistant / Today 成为唯一默认协调入口 | TARGET_APPROVED | 签署 Today 最小产品契约 | 当前 Portal 仍是生产入口 |
| KENOS-003 | Portal 是待退役迁移源，不是长期 Space | TARGET_APPROVED | 确认 Today/Inbox/Approval/Activity 四个前置 gate | 未达 gate 不 redirect/删除 |
| KENOS-004 | 模块化单体 + 清晰领域边界 + 一个 Supabase 项目 | TARGET_APPROVED | 冻结 schema/package 边界和依赖方向 | 不过早拆微服务/多 DB |
| KENOS-005 | 每类数据一个写入 Owner，其他域只引用/投影 | TARGET_APPROVED | 对存量表和本地真源做 ownership inventory | 不允许长期双写 |
| KENOS-006 | 安全域为 Personal / Work / Household / System | TARGET_APPROVED | 冻结跨域默认值、Work 保留和 cloud AI 政策 | 缺失分类按更严格处理 |
| KENOS-007 | 数据分类为 public/personal/sensitive/work_confidential/restricted_local_only/ephemeral | TARGET_APPROVED | 定义 storage/model/search/retention 策略 | 先加元数据和强默认 |
| KENOS-008 | Assistant 只提交 Action Request，不可越过 Policy/Approval/Executor | TARGET_APPROVED | 冻结 R0-R4 和不可永久授权列表 | 高风险动作 100% 审计 |
| KENOS-009 | 核心互通为 Entity/Action/Capture/Activity/Approval/Outbox/Connector 契约 | TARGET_APPROVED | RFC 评审和两个真实消费者试点 | 现有 `contracts/events` 增量演进 |
| KENOS-010 | 采用 Strangler Fig，兼容层必须有删除日期 | TARGET_APPROVED | 每个 slice 先进入 Migration Ledger | 不做一次性重写 |
| KENOS-011 | Minimum Sustainable Core 高于高级自动化 | TARGET_APPROVED | 冻结 Core SLO 和降级演练 | Capture/Find/Plan/Work/Library/Sync/Permissions/Activity/Backup/Basic Assistant |
| KENOS-012 | Git 以 `master` 为唯一分支，无 worktree/stash/checkpoint branch | CURRENT_INVARIANT | 无 | 根 `AGENTS.md` 覆盖 review 早期分支建议 |

## Apple 客户端决策

| ID | 决策 | 状态 | 实施前最后一步 |
| --- | --- | --- | --- |
| APPLE-001 | 用户只看到 Kenos，领域是 Spaces，不是多个需安装的 App | TARGET_APPROVED | 为现有 Tauri/Capacitor/companion 列出渐进退役图 |
| APPLE-002 | 一个 Apple workspace，三个 product target，共享 Swift packages | TARGET_APPROVED | 决定 monorepo 目标路径和工程生成策略 |
| APPLE-003 | iPhone/iPad=随身感知与执行；Mac=深度工作与本地 AI；Watch=即时状态与微操作 | TARGET_APPROVED | 冻结首批导航与非目标 |
| APPLE-004 | Web 保留深度管理与快速演进，WebView 只是过渡 | TARGET_APPROVED | 对每个 Space 做 native-value 矩阵 |
| APPLE-005 | App Intents 是 Apple 系统入口的 adapter，核心 Action Contract 不以 Swift 为唯一真源 | TARGET_APPROVED | 先实现 CreateTask/CompleteTask/CaptureContent 三个端到端契约 |
| APPLE-006 | 三端各有本地缓存与 Outbox，不新建领域真源 | TARGET_APPROVED | 冻结 SQLite、冲突策略和密钥保存方式 |

## 仍需冻结的业务决策

| ID | 问题 | 默认建议 | 不决定的影响 |
| --- | --- | --- | --- |
| OPEN-001 | HealthOS 用户名称最终是 Health 还是 Status？Focus 归哪里？ | 领域 ID `health`；Status 为 Assistant/Today 读模型，Focus 为平台能力 | 命名和数据 Owner 可漂移 |
| OPEN-002 | Work 保密内容能否进入个人 Supabase/本地模型？ | 默认不进个人云；本地处理也以公司政策为准 | 不得开 Work connector 镜像或 embedding |
| OPEN-003 | Household 是否当期实现多用户？ | 首期只定义域与 Owner，不做多账户界面 | 避免过早扩张 RLS |
| OPEN-004 | Goal/Value 层是独立 Core 还是 Plan 子域？ | 作为 Core Goals，不直接修改领域数据 | Coordination 缺稳定决策依据 |
| OPEN-005 | Mac Runtime 是 XPC、localhost service 还是延续 Tauri sidecar？ | 先做威胁模型和能力 spike，不在 UI 开发中顺便定 | 连接安全与后台生命周期不可验收 |
| OPEN-006 | Apple 客户端目录是 `clients/apple` 还是 `apps/kenos-apple`？ | `clients/apple`，并在 boundary guard 声明只依赖 contracts/API | 未定前不得创建 Xcode workspace |
| OPEN-007 | 每日主动中断预算是否冻结为 3？ | 3 为初始默认，用真实数据调整 | Notifications 先保持 Digest/Contextual |
| OPEN-008 | Portal 域名和旧 deep link 保留多久？ | 至少两个稳定发布周期 + 30 天无旧写入 | 无法冻结 retirement 日期 |

## 决策记录模板

```markdown
## KENOS-XXX 标题

- Status: PROPOSED | TARGET_APPROVED | IMPLEMENTED | RETIRED
- Owner:
- Date:
- Context:
- Decision:
- Alternatives considered:
- Consequences:
- Data owner / security domain / classification:
- Offline and failure behavior:
- Migration and rollback:
- Validation evidence:
- Review or expiry date:
```
