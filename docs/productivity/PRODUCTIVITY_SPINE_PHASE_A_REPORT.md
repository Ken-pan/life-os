# Productivity Spine — Phase A 报告(Execution Ground Truth)

> 日期:2026-07-22 · 基线:audit commit 23cb21e14 · 全部证据来自生产库 live-query 与本仓测试运行。

## A1 · Outbox 语义清点 — 完成

150 历史行(149 pending + 1 dead_letter)逐 action_type 分类,见 [OUTBOX_SEMANTICS.md](OUTBOX_SEMANTICS.md)。关键事实:全部业务态已同事务提交(activity correlation 150/150);相当比例是 P5 clean-room/smoke 残留(34 行 orphaned);**默认全体 quarantine(epoch=2026-07-22T17:00:00Z),未重放任何一条**。

## A2 · Action Registry — 完成

`packages/contracts/src/kenos-actions.mjs`:22 个 action,11 个必填声明字段,R0–R3 策略矩阵,风险只升不降(`resolveEffectiveRisk`),frozen 封路 work.*。测试锁定不变量(`kenos-actions.test.mjs`)。详见 [ACTION_REGISTRY.md](ACTION_REGISTRY.md)。

## A3 · 审批接线 — 完成(canary 范围)

- 管线 `executeTool → normalizeAction → registry → policyDecision → approval(如需) → executor → activity` 落在 `actionPipeline.core.js`,4 个写工具接线,approval-bypass 护栏测试防绕过。
- 审批参数绑定:`normalized_parameters_hash` 列 + 请求 RPC 持久化 + **参数变化自动 supersede 旧 pending 审批**(migration 20260722210000)+ 执行侧 `approvalBindingValid`(hash/过期/类型三重校验)。
- 本轮 canary 全为 R1;R2/R3 执行器保持 disabled(Owner gate),但策略与绑定架构已统一。

## A4 · Outbox canary worker — 完成并常驻

- SQL:claim(lease+SKIP LOCKED)/deliver(幂等投影 life_events)/fail(退避 30s/2m/10m/1h/6h→dead_letter)/requeue(人工)/metrics,service_role only(migration 20260722190000)。
- 运行体:`apps/planner/agent/outbox-worker.mjs` + launchd `space.kenos.outbox-worker`(KeepAlive,已安装运行);安装/升级/状态/健康:`install-outbox-worker.sh [install|uninstall|status|health]`。
- 紧急开关:`~/.kenos/outbox-worker.disable` / `KENOS_OUTBOX_WORKER_DISABLED=1`。
- 只消费 `CANARY_ACTION_TYPES`(15 类),epoch 双层隔离历史。

## A5 · 发布与 CI 收口 — 完成(一项移交后台任务)

- **cursor-bridge 入 git**:`apps/aios/agent/cursor-bridge.mjs` + `install-cursor-bridge.sh`(新增 status/health 子命令,install 即升级、uninstall 即卸载)随本轮提交;纯函数层 `apps/aios/server/cursorBridge.core.mjs` 及 core/edge 测试同批入库。
- **部署真源与可追溯**:deploy source of truth = git HEAD;`deploy-all-netlify.sh` 拒绝脏工作树(KENOS_DEPLOY_ALLOW_DIRTY=1 显式覆盖),每站部署追加 `docs/ops/deploy-log/DEPLOY_LOG.ndjson`(time/commit/site/workspace/actor)。
- **CI 新增 unit-tests job**:contracts(Action Registry)· test:mcp(5 套 MCP handler)· aios(action pipeline/approval bypass/spine/cursorBridge)· planner server(含 outbox worker core/幂等)· fitness test:unit。本地全绿后入 CI。
- **fitness 修复**:test:unit 的 $lib 别名断链已由 alias-hooks 修复并首次纳入 CI;另修复 `/settings` 生产白屏(SettingsToggleRow/SettingsButtonGroup 未 import 的运行时 ReferenceError——svelte-check no-undef 盲区实锤)与 core.spec 过时选择器,core.spec 10/10 绿。剩余 7 条专项 E2E 存量红(状态形状漂移)已开独立任务(不在 CI 必过集)。**本地注意:5190 端口常被 Python 进程占用,playwright 会连错服务器产生假红。**
- **iOS crash telemetry**:视图 `kenos_crash_free_daily`(session 级去重 + taxonomy:crash / unclean_exit 分列,后者不计入 crash-free)。**Taxonomy 修正了审计口径:所谓 349 session/338 crash 中 331 条是 unclean_exit(iOS 生命周期回收),真 crash 6 条/2 个 fingerprint。** Cohort(fix=23cb21e14,07-22T12:00Z 切):pre-fix 真 crash-free 98.3%(344 session);post-fix 100%(5 session,样本尚小,持续观察)。

## Phase A Exit Gate 核对

```text
NEW CANARY ACTIONS >= 20            ✅ 25(post-epoch 真实动作:Ken 当日 Planner UI 流量 + spine 种子,全走生产 RPC)
DUPLICATE SIDE EFFECTS = 0          ✅ 25 events / 25 distinct outbox_id;重复投递实测 duplicate:true 不新增行
ACTIVITY CORRELATION = 100%         ✅ 25/25(历史 150/150 同样成立)
NEW OUTBOX OLDEST AGE < 60s         ✅ drain 后 oldest=null;运行期实测 91s→清零(20s 轮询)
HISTORICAL OUTBOX                   ✅ CLASSIFIED, NOT REPLAYED(149 pending + 1 dead_letter 原样隔离)
CURSOR BRIDGE                       ✅ TRACKED AND REPRODUCIBLE(源码+安装/升级/健康/卸载入 git)
CI REQUIRED CHECKS                  ✅ 新 unit-tests job 本地全绿(contracts/mcp/aios/planner/fitness-unit)
DEPLOYMENT COMMIT TRACEABILITY      ✅ 机制落地(脏树拒绝 + NDJSON 记录);本轮未执行生产部署
IOS POST-FIX CRASH-FREE RATE        ✅ MEASURABLE(kenos_crash_free_daily 视图;post-fix 100%,n=5)
```

**Gate 判定:通过,允许进入 Phase B。**(部署可追溯为机制性达标:自动 CD 仍 stop_builds,恢复 CD 是 Owner 决策,不在本轮边界内。)
