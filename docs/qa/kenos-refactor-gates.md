---
title: Kenos 重构质量门与验收手册
owner: kenpan
last_verified: 2026-07-18
doc_role: refactor-qa-playbook
status: ready-for-phase-0
---

# Kenos 重构质量门与验收手册

## 1. 核心原则

“代码写完”“build 通过”“截图看起来对”都不能单独证明重构完成。每个 slice 根据风险通过九个 Gate，并提供可复核证据。

## 2. 九个 Gate

| Gate | 必答问题 | 最低证据 | Blocker 示例 |
| --- | --- | --- | --- |
| 1 Outcome | 改善了哪个真实结果？ | 场景、旧基线、目标 | 只有架构洁癖或 rename |
| 2 Research | 官方/行业方案是什么？ | 一手来源、采纳/拒绝理由 | 自造身份、同步、权限协议 |
| 3 Domain | Owner、边界和单一 writer 清楚吗？ | ownership/ledger | 两个地方都能完成同一任务 |
| 4 UX | 是否减少认知负担？ | 主路径、错误/离线/恢复文案 | 需要用户持续审核系统 |
| 5 Security | 域、分类、权限、风险正确吗？ | RLS/跨域/审批/脱敏测试 | service role 到客户端 |
| 6 Implementation | 类型、数据、状态和错误可靠吗？ | unit/contract/build | 静默失败、无幂等 |
| 7 Integration | 跨域/跨端/Connector 正确吗？ | E2E、outbox、retry/conflict | happy path only |
| 8 Real-use | 真实生活中完成了吗？ | 真账号/设备/数据场景 | 只有 demo fixture |
| 9 Compounding | 下次是否更便宜、更安全？ | 删除重复、资产、维护指标 | 新增第二套 glue code |

高风险 slice 的任一 Gate 未通过均不能 cutover。低风险文档/UI slice 可将不适用项标 `N/A`，必须说明理由。

## 3. 测试金字塔

### Level 1 - Static and contract

- TypeScript/Svelte/Swift compile。
- package dependency boundary。
- manifest/schema staleness。
- JSON fixture 在 TypeScript/Zod、SQL boundary、Swift Codable 一致。
- token、enum、version、event/action naming contract。

### Level 2 - Unit and policy

- 领域校验、risk classification、permission、idempotency。
- conflict/merge/compensation。
- classification/model-routing/retention。
- UI state reducer 和 adapter，不用大量像素测试替代行为测试。

### Level 3 - Component behavior

- keyboard/focus/touch/reduced-motion/a11y。
- loading/empty/error/offline/queued/conflict/undo。
- theme 只能改变表达，不能改变控制行为。

### Level 4 - Pattern integration

- Action → Policy → Approval → Executor → Activity。
- Capture → durable inbox → routing → domain materialization。
- Domain write + Outbox atomicity → consumer idempotency。
- Connector health/reauth/rate limit/schema change。

### Level 5 - App/client smoke

- 每个 Web app 的关键路由、auth、PWA shell、safe area。
- iOS/macOS/watchOS 的登录、离线、后台、deep link、system extension。
- 现有旧壳与新 Kenos 的 migration parity。

### Level 6 - Selected visual

- 共享 theme/primitive/pattern 的 catalog matrix。
- 只对高价值生产全页做 desktop/mobile/light/dark baseline。
- 像素 snapshot 不代替行为、可访问性和真机测试。

### Level 7 - Real-use and recovery

- 真数据、真账号、真设备、真实任务。
- 恢复备份、Connector 失效、Mac/Vault 离线、版本冲突。
- 维护时间、重复输入和用户审核量。

## 4. 现有仓库基线命令

### 快速无外部副作用

```bash
npm run check:lifeos-boundaries
npm run check:app-manifests
npm run validate:tokens
npm run check
npm run build
```

### Identity / Outbox

```bash
./scripts/verify-life-os-identity-p0.sh
./scripts/test-outbox-trigger.sh --smoke
```

这些可能依赖远程 Supabase，运行前核对 env/网络/生产授权。不得把远程失败简单归因于代码。

### Design system

```bash
npm run test:design-catalog
npm run test:design-catalog:a11y
npm run test:design-catalog:snapshots
```

共享视觉基线更新必须使用:

```bash
npm run test:design-catalog:snapshots:canonical
```

macOS 本地更新的像素基线不可直接当 CI canonical。

### PWA

```bash
PWA_APP=<id> npm run pwa:healthcheck
PWA_APP=<id> npm run test:pwa
PWA_APP=<id> npm run qa:mobile-scroll
```

Playwright 首次需安装全部浏览器；WebKit 是 iPhone 模拟项目必需。已知仓库基线缺口: AIOS preview case、Knowledge library shell overflow assertion；遇到时先对照 `AGENTS.md`，不要误判为新迁移回归。

### Package tests

```bash
npm run test -w <workspace>
```

`packages/contracts` 当前 standalone `npm test` 直接跑 `.ts` 有已知 `ERR_UNKNOWN_FILE_EXTENSION`；在修正 test runner 前，以 `npm run check`、boundaries 和调用方 fixture tests 为主，不能虚报 standalone 通过。

## 5. Contract Gate

每个新 runtime envelope 至少覆盖:

- 最小合法 payload。
- 缺失必需字段。
- 未知 schema major。
- 未知可选字段。
- 非法 UUID/timestamp/domain/classification。
- 旧版本 compatibility fixture。
- 敏感字段 redaction。
- TypeScript/Swift round-trip 不丢语义。

通过标准:

- 两个不同消费者使用同一 fixture corpus。
- additive change 不破坏旧 consumer。
- breaking change 有新 major、migration 和旧版本 sunset。

## 6. Entity/Ownership Gate

### 必测

- 一个业务对象只有一个 owner domain。
- 跨域只保存 `EntityRef`，不复制可独立修改状态。
- 删除/归档目标后，引用方显示明确 tombstone，不崩溃或悄悄创建副本。
- owner/version 不匹配拒绝写入。
- entity link 的 AI source/confidence/provenance 可见。

### 对账

```text
source objects
= target authoritative objects
+ intentionally archived/rejected
+ documented conflicts
```

所有孤儿、重复和 unknown owner 都有处理决定。

## 7. Security Gate

### RLS

- 同一用户正常 CRUD。
- 第二用户无法 select/insert/update/delete 第一用户数据。
- 同一用户但无 capability 时跨安全域拒绝。
- `WITH CHECK` 防止修改 owner/domain/classification。
- view/RPC 不绕过 RLS。
- anon/authenticated grants 最小化。

### Assistant/Action

- R0/R1 在授权内自动。
- R2 有 preview 或 Undo。
- R3 必须明确批准，payload 修改后旧批准失效。
- R4 未实现时 fail closed；已实现时备份、强确认、影响摘要齐备。
- LLM/客户端无法伪造较低 risk 跳过 Policy。
- Activity 对敏感字段脱敏，Audit 保留必要证据。

### Connector

- token 过期进入 `reauth_required`。
- rate limit 有 retry time，不忙等。
- schema change 停止不安全写入。
- disconnect 可撤销 token，并按 policy 处理镜像。
- 插件没有 service role、Cookie 上传或跨域隐式访问。

## 8. Idempotency / Outbox / Conflict Gate

### 故障注入矩阵

| 注入点 | 预期 |
| --- | --- |
| client 发送前崩溃 | 本地 outbox 保留，UI 可见 queued |
| server 写业务后、响应前断网 | 重试不重复业务对象 |
| outbox publish 前 worker 崩溃 | 记录仍 pending，可重试 |
| consumer 处理后、ack 前崩溃 | idempotency 阻止重复副作用 |
| 两设备同 base version 更新 | 明确 conflict/merge，不静默 LWW |
| dead letter | System issue + retry/resolve action |
| 时间/时区差异 | occurred/received 和用户时区语义明确 |

### 通过标准

- 相同 idempotency key 的重复请求结果一致。
- 不同合法 mutation 可按领域策略合并或冲突。
- 业务数据和 outbox 不出现单边提交。
- 所有 retry 有上限、backoff 和用户可见终态。

## 9. Capture Gate

验证:

- Capture 在 AI 分类前已本地/服务端安全持久化。
- 相同 URL/hash 重试不重复。
- 来源、时间、外部 ID、security/classification 不丢。
- offline capture 恢复后同步。
- restricted/work 内容不发到不允许的模型。
- 不确定项进入 Inbox，不要求用户立刻复杂整理。
- 同一 capture 派生 Library/Plan/Work 时保留关系，不复制原始真源。

首阶段真实场景: 从浏览器或 Share Sheet 保存一个项目来源并创建一个 Plan task，随后 Assistant 能引用来源和 task。

## 10. Web UI Platform Gate

### AppShell

必须按现有 migration guide 验证:

- 单一 scroll root。
- desktop/mobile nav projection。
- top/bottom safe area。
- bottom nav/persistent overlay 不遮最后内容。
- locked canvas 与 dialog 独立滚动。
- skip link、main focus、route navigation。
- portrait gate、toast、modal layering。
- 无 app CSS 深层覆盖 shell 内部 selector。

每个采用 app 建 `life-os-app-shell-<app>-validation.md` 和对应 PWA spec。

### Settings/theme

- 相同控制行为在 default/Music theme 下键盘、touch、ARIA 一致。
- theme 只改 semantic visual token，不隐藏状态或改变风险语义。
- variant 有文档和 catalog state。
- app-local override 不依赖共享组件内部 class，不用无说明 `!important`。
- Music 普通系统控件不 fork；Now Playing/lyrics/visualization 领域组件可保留。

## 11. Portal Retirement Gate

在 redirect 前:

- Today summary 计数/时区/tombstone parity。
- 所有 Portal 核心动作在新入口可完成。
- 登录、SSO、default entry、badges、settings、install/deep links 有迁移结果。
- Portal 新功能冻结，旧写入有监控。

在删除前:

- 两个稳定发布周期真实使用通过。
- 30 天或 owner 冻结周期内无旧写入。
- 旧域名无 auth loop/404/redirect loop。
- rollback 演练通过。
- Netlify/manifest/registry/PWA/CI/RPC/job/docs 删除清单完成。

在宣布完成前:

- Portal app 和兼容 routing 已删除。
- System Overview/Roadmap/ops 不再将 Portal 写为现役产品。
- `portal.kenos.space` 的最终 DNS/redirect 策略有证据。

## 12. Apple Foundation Gate

### 自动化

- iOS/macOS/watchOS targets 编译。
- shared package unit tests。
- contract fixture/Codable parity。
- SQLite migration from previous test version。
- Keychain/auth refresh tests。
- deep link routing tests。

### Simulator

- 登录/登出/冷启动/升级。
- online/offline task create/complete。
- queued/retry/conflict/undo UI。
- Dynamic Type、dark mode、reduce motion、VoiceOver 基础。
- iPhone/iPad size classes 和 macOS window resizing。

### 真机硬门

以下不能只靠 Simulator:

- HealthKit 读取/写入与最小权限。
- WatchConnectivity 后台/不可达/恢复。
- 通知 action、Live Activity、Widget refresh。
- Share Extension、Files、Camera、RoomPlan。
- background task、battery/thermal、local network/runtime。
- Keychain/access group、升级安装和数据保留。

### Foundation 终局场景

三端登录同一账户。iPhone 离线创建任务，Watch 暂不可达，Mac 在线；恢复网络后 Plan 只出现一个任务，三端最终显示相同状态，Activity 解释来源和同步，重复 retry 无副作用。

## 13. Old Native Shell Retirement Gate

每个 AIOS/Knowledge/Health Tauri、Health companion、Music Capacitor capability 删除前证明:

- 数据 Owner 和所有本地路径已盘点。
- 新 Kenos surface 功能、权限、deep link、通知和离线 parity。
- 旧壳只读观察期无写入。
- 用户数据可导出/恢复。
- background jobs、tokens、entitlements、bundle callbacks 已迁移或撤销。
- 卸载旧壳不丢唯一数据。
- rollback 安装包/版本在窗口内可用。

## 14. SLO 验收

| SLO | 测量方式 | 初始目标 |
| --- | --- | --- |
| 本地反馈 | action 到 UI 状态 | p95 ≤ 150ms |
| Capture durability | 输入到持久化确认 | p95 ≤ 500ms |
| 在线 sync | local mutation 到 authoritative ack | 95% ≤ 10s |
| 静默失败 | 无用户/系统可见终态的失败 | 0 |
| 高风险审计 | R3/R4 有完整 Activity/Audit | 100% |
| AI 自动写入解释 | 有 reason/evidence/policy/result | 100% |
| Connector health | 每日检查有结果 | 100% 现役 Connector |
| Backup | 可验证最近备份 | 每晚 |
| Restore drill | 隔离环境恢复并抽样 | 每月 |

初始目标需在 Phase 1 用实际 telemetry/测试定义精确口径，不能只写文档数字。

## 15. Real-use Gate

每个 slice 至少记录:

```markdown
- Scenario:
- Real data/device/account used:
- Previous workflow and time/steps:
- New workflow and time/steps:
- What succeeded:
- Friction/errors:
- Data integrity check:
- Offline/recovery observation:
- Did it reduce maintenance or merely move it?
- Keep / revise / retire decision:
```

示例不是“打开 Today 看到了卡片”，而是“从 Jira/Figma 捕获到 Work，形成 Library 来源和 Plan 行动项，会议前能由 Assistant 找回且没有重复输入”。

## 16. Compounding Gate

至少证明一项:

- 删除了重复写路径/组件/脚本/页面。
- 新契约被第二个不同消费者复用。
- 下一个 app/client 接入文件数或人工步骤下降。
- 自动化减少重复工作且没有增加审核负担。
- 失败经验转成测试/guard/runbook。
- 过期兼容层、feature toggle、旧部署被删除。

如果只增加平台代码、维护状态和文档，没有消费方或删除项，不通过 Compounding Gate。

## 17. Phase exit evidence

### Phase 0

- Owner/security/classification inventory。
- P0 decisions frozen。
- Ledger 首批 slice 完整。
- Minimum Core 与 SLO 可测。

### Phase 1

- Action 垂直切片、RLS、idempotency、outbox、Activity、offline/retry 全通过。
- 共享 contracts 两个不同消费者。
- Web convergence 有 migrate/keep 证据。

### Phase 2

- Assistant/Today 真实使用。
- Portal freeze/cutover/observation/retirement/compat removal 证据。

### Phase 3

- 一个真实 Work 闭环。
- Work policy/Connector lifecycle/单一捕获证据。

### Phase 4

- Apple Foundation 端到端场景。
- 真机 gate。
- 旧壳逐 capability 退役证据。

### Phase 5

- 主动能力独立信任升级。
- 0 未解释写入。
- 维护和审核成本下降。

## 18. 失败记录规则

测试失败不要只写“red”:

- 记录 first failing step，而不是最后一行。
- 区分代码回归、已知 baseline、环境缺失、远程 drift、flaky。
- 保留最小日志/trace/screenshot，敏感内容脱敏。
- 修复后证明测试能被故意破坏（mutation check），避免空测试。
- 已知 gap 进入 `docs/qa/e2e-issues.md` 或相关 app QA，不在聊天里失踪。

## 19. 最终验收问题

重构结束时必须能立即回答:

1. 默认从哪里进入？Assistant/Today。
2. 一件数据属于哪里？唯一 domain owner。
3. Assistant 为什么能做？Policy、risk、approval、Activity。
4. 多域冲突怎么办？硬约束/规则先裁决，Assistant 解释。
5. 离线或 Mac/Vault/Connector 挂了怎么办？明确队列、降级和恢复。
6. 旧系统什么时候删除？Ledger 有日期和证据。
7. 系统是否越来越省心？重复输入、审核和维护时间下降。
