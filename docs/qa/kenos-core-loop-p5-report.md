---
title: KENOS P5 — Core Loop Reality Closure 交付报告
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-evidence-report
status: PASS_LOCAL_READY_FOR_PRODUCTION_GATE
---

# KENOS P5 — Core Loop Reality Closure

**结论:`PASS_LOCAL_READY_FOR_PRODUCTION_GATE`**

一个真实对象在规范云数据上完整走通:
**Capture → Plan Task → Daily/Today → 编辑(标题/到期日) → Complete → Activity → Continue → 重启 → 幂等重放 → 断网恢复 → 越权隔离**。
证据 harness `scripts/kenos-daily-beta/core-loop-e2e.mjs` 11/11 PASS(全部经真实产品 UI 或 UI 同款规范 RPC,无 mock 持久层),证据目录 `docs/qa/evidence/kenos-core-loop-2026-07-22/`。

## 1. 现在真实可用的行为(规范持久化)

| 行为 | 入口 | 证据 |
| --- | --- | --- |
| 快速捕获落库 | AIOS 今日 → 快速捕获 → 打开收件箱 | LOOP1:`kenos_capture_envelopes` needs_review 1 行 |
| 捕获→计划任务 | AIOS /inbox「转为计划任务」 | LOOP2:capture `materialized` + `planner_tasks` 规范行(事务内 create RPC) |
| 编辑标题/到期日 | Plan 任务编辑器(kenosTask 深链) | LOOP3:title/due 经 update RPC 落库 |
| 今日投影 | AIOS Today 计数 + Plan 列表 | LOOP4:`portal_today_summary` todayOpen 计入 + 双面渲染 |
| 完成→Activity | Plan 行 toggle | LOOP5:completed=true + `kenos_plan_activity` plan.complete_task 行 |
| Activity 呈现 | AIOS /activity | LOOP6:规范源 `kenos_list_plan_activity` 合并渲染(本切片新增) |
| Continue 跨端 | Plan Continue CTA → AIOS | LOOP7:resume descriptor 绑定 taskId,handoff 落地 AIOS |
| 重启不丢不重 | 新会话上下文 | LOOP8:该对象恰 1 行 |
| 幂等 | 原幂等键重放 ×2 | LOOP9:duplicate:true ×2,任务仍 1 条 |
| 断网恢复 | 离线建任务→重连 | LOOP10:队列落盘→flush 恰 1 条、队列净空 |
| 越权隔离 | 用户 B + 匿名 | LOOP11:B 不可见/不可转换 owner capture(capture_not_found)、B 读不到 owner activity、匿名 permission denied |

iOS(真机 17 Pro):`npm run kenos:ios-stability:smoke` 26/26 PASS(p50 447ms,0 P0/P1),原生壳 WKWebView 载入与 Web 完全相同的 daily-beta release(同一规范数据)。模拟器截图提供未登录空态(`ios-sim/`);登录态 iOS 视觉确认归属 Owner 三日 dogfood(手机已有登录态)。

## 2. 规范数据图

| 实体 | Owner(唯一写者) | 写路径 | 读投影 | Activity 来源 | 离线/重试 |
| --- | --- | --- | --- | --- | --- |
| CaptureEnvelope | Platform(`kenos_capture_envelopes`) | `kenos_ingest_capture_envelope_action`(原子:capture+outbox+activity+幂等表) | `kenos_list_capture_envelopes`(AIOS /inbox) | RPC 内写 | 写失败显式报错,不静默;无本地队列(诚实边界) |
| Plan Task | Plan(`planner_tasks`) | `kenos_create_plan_task_action` / update/complete 系列 RPC(UI 与 convert 共用) | Planner UI + `portal_today_summary` 计数 | RPC 内写 `kenos_plan_activity` | `planOfflineIntentQueue`(localStorage 持久、幂等键重放、5 次死信) |
| Activity | Plan(`kenos_plan_activity`,append-only) | 仅 Plan 命令 RPC 事务内 | `kenos_list_plan_activity`(本切片接入 AIOS /activity,flag 门控) | 即本体 | 只读,fail-open 合并(不拖垮 legacy feed) |
| Resume/Continue | 客户端 localStorage(`kenos.spaceSwitcher.v1` / `kenos.continue.v2.*`,owner 绑定) | Plan Continue CTA 显式 handoff | AIOS Continue sheet | N/A | 本地持久;云 SSOT 是任务本身 |

**无永久双写**:Activity 合并为只读投影;`life_events` 兼容源与规范源按 correlation 去重,未来 outbox delivery 开启也不会双渲染。

## 3. 本切片修复的真实产品缺陷

1. **AIOS 冷启动登录态卡 30 秒**(`cloud.svelte.js`):auth 恢复晚于首次投影读,读失败后被 30s 节流锁死在"连接账户"视图。修复:auth 恢复(INITIAL_SESSION/getSession 两路径)强制刷一次 control center。
2. **Daily Beta 的 AIOS 无 Supabase 配置**:aios 无 .env,beta 内 AIOS 云读写全死。修复:`kenos-ctl.sh` 构建时从 `apps/planner/.env` 单源引入 `PUBLIC_SUPABASE_*`。
3. **Capture ingest/convert flag 未进 beta**:补入 aios 构建环境(Owner cohort)。
4. **完成动作的 Activity 断链**:新增 `planActivityReadSource.core.js`(flag `VITE_KENOS_PROD_READ_PLAN_ACTIVITY`,生产默认 Off)。
5. **iOS 稳定 hostname 谓词过时**:接受 Tailscale MagicDNS(`.ts.net`)。

## 4. 变更清单(本地提交,未 push)

- `4b590f2cb` feat(kenos): canonical Plan Activity read + Daily Beta capture flags
- `<HEAD>` feat(kenos): P5 core-loop closure — auth-restore refresh + E2E evidence harness(+ 本报告与 iOS 证据、hostname 谓词)
- 关键文件:`apps/aios/src/lib/kenos/planActivityReadSource.core.js`(+test)、`prodReadFlags.core.js`、`readSources.js`、`cloud.svelte.js`、`scripts/kenos-daily-beta/{kenos-ctl.sh,core-loop-e2e.mjs}`、`scripts/kenos-ios-stability/lib.mjs`
- 迁移:无新增(全部使用已在生产的 RPC/表)
- Legacy:未删除任何旧路径;Planner Legacy 直写在非 cohort 场景仍在(既有台账事实,非本切片范围)

## 5. 诚实边界(不假装)

- AIOS Today 为只读投影(计数);任务操作在 Plan 面——这是既定分工,不是缺口。
- iOS Daily Beta 全程 in-app web;原生 KenosStore/KenosClient 仍为 mock 且不在激活路径。
- 离线支持 = 持久重试队列 + 缓存读,不是完整离线;Capture 无离线队列(失败显式报错)。
- 过期鉴权路径:JWT 过期等同匿名(LOOP11 已证拒绝);未单测"过期中间态"。
- `VITE_KENOS_PROD_READ_PLAN_ACTIVITY` 生产默认 Off——生产 Activity feed 暂不含规范源,直至下方批准门。

## 6. 剩余批准门(需 Owner 明示批准)

**GATE-1:push + Netlify 生产部署**(含冷启动修复 + Activity 读源代码,flag Off 不改变生产行为)
- 命令:`git push origin master`
- 影响:AIOS/Planner 等站从新 commit 构建;冷启动登录恢复修复立即生效;Activity 规范源保持 Off
- 回滚:Netlify 站点回滚到上一 deploy(各站 deploys 面板一键)
- 验证:生产 AIOS 登录后冷启动 Today 即显真实计数(无 30s 空窗)

**GATE-2:生产开启 Activity 规范读**(可选,GATE-1 之后)
- 操作:AIOS Netlify 站点加环境变量 `VITE_KENOS_PROD_READ_PLAN_ACTIVITY=1` 并重建
- 影响:生产 /activity 合并显示 plan.complete/create 等规范记录
- 回滚:删除该变量重建
- 验证:完成一个任务后 /activity 出现对应记录

**GATE-3:生产开启 Capture 闭环 Owner cohort**(可选)
- 操作:AIOS 站点加 `VITE_KENOS_CAPTURE_INGEST_WRITER=1`、`VITE_KENOS_CAPTURE_CONVERT_WRITER=1`、`VITE_KENOS_CAPTURE_WRITER_OWNER_EMAILS=334452284ken@gmail.com`(convert 同名 emails 变量继承)
- 影响:生产 AIOS 快速捕获→收件箱→转任务对 Owner 生效(与 beta 同一 RPC)
- 回滚:置 0 重建
- 验证:生产跑一遍捕获→转换→Plan 出现任务

## 7. Owner 三日 dogfood 清单(每天 ≤5 分钟)

**Day 1 — 捕获与转换**
- [ ] 手机 Kenos:今日 → 快速捕获,记一条真事 → 打开收件箱
- [ ] 收件箱点「转为计划任务」→ 打开 Plan 确认任务在
- [ ] Mac Web(127.0.0.1:5219)刷新:同一任务可见

**Day 2 — 完成与 Activity**
- [ ] 给昨天的任务设今天到期 → 今日计数 +1
- [ ] 在 Plan 完成它 → AIOS /activity 看到完成记录
- [ ] 手机杀 app 重开:状态一致、无重复

**Day 3 — Continue 与离线**
- [ ] Plan 里开某任务详情 → 点 Continue → AIOS「继续刚才的事」能回到该任务
- [ ] 开飞行模式在 Plan 建一条任务 → 关飞行模式 → 任务出现且只有一条
- [ ] 有任何一步不对:`npm run qa:app-logs` + 截图给会话

> 运行 harness 复核:`bash scripts/kenos-daily-beta/kenos-ctl.sh start && node scripts/kenos-daily-beta/core-loop-e2e.mjs`
