# Fitness Roadmap

**URL：** [fitness.kenos.space](https://fitness.kenos.space) · **Workspace：** `fitness-os` · **Dev 端口：** 5190

## 一句话

Focus Mode 力量训练 + Coach Lite；Portal **PORT.GROWTH.4** 已读最近完练；**`fitness.workout_logged` 已生产**（GYMS.EVENTS.1 ✅）。

## 当前能力（生产）

| 域          | 状态 | 要点                                                          |
| ----------- | ---- | ------------------------------------------------------------- |
| Focus 训练  | ✅   | `/day/[id]/focus` · 组次/RIR · Summary                        |
| 计划/统计   | ✅   | `/program/edit` · `/stats`                                    |
| 云同步      | ✅   | `fitness` schema · 练完上传 · 错误横幅在后续成功后自动消失（`c43bb1190`，2026-07-16） |
| Integration | ✅   | SSO · Portal 摘要                                             |
| E2E         | ✅   | **20/20**（GYMS.CORE.0 ✅）                                         |
| life_events | ✅   | `fitness.workout_logged` 触发器 + outbox 结构检查（GYMS.EVENTS.1 ✅） |

## Next（按 ROI）

_**GYMS.PORTAL.2** 已发货（2026-07-10）— Portal Fitness 卡 `workedOutToday`；migration `20260710203000` **远程已应用**；`verify-ft-p2-prod.mjs` PASS。_

_**GYMS.SUB.5** 已发货（2026-07-13）— 替代动作完整训练流；工程 + 产品 UI/copy closure 全绿（#19 `67e72b81`），`session-queue`+`substitution` specs 9/9。详见 [`../../../apps/fitness/docs/FT-P5-substitution.md`](../../../apps/fitness/docs/FT-P5-substitution.md)。_

_**GYMS.VOL.6 + GYMS.BW.7** 已发货（2026-07-14）— Stats 两块高 ROI 面板：① 每周各肌群容量 vs 增肌区间（MEV–MRV，三态着色，复用 `coachMetrics` 现成数据）；② 体重记录 + 30 天趋势（`settings.bodyweight`，随 settings 云同步）。顺带修复 `coachMetrics` 在英文 locale 下容量统计因 `ex.m` 被本地化而全部落空的既有 bug。`svelte-check` 0 error，中英/lbs·kg 双语双单位已验。_

_**GYMS.VOL.6a** 科学性修正（2026-07-14）— 容量仪表盘改用**分数容量**计数（主动肌 1.0 + 复合动作协同肌 0.5，口径与 RP/Israetel 地标一致）。修复纯直接组计数的系统性低估：臀由「假偏低 3」→「达标 7.5」，二头 8→14、三头 8→13；侧束/后束（肩）刻意不吃卧推前束间接容量，保留真实缺口不被掩盖。`exerciseContributions()` in `coachMetrics.js`。_

_**GYMS.READY.8 + GYMS.WARMUP.9** 已发货（2026-07-14）— ① 自动调节：`coach.readinessAssessment()` 把近 7 天 RIR + 周期信号转成今日可执行建议（疲劳→减组/降重 action tip；恢复充分→绿灯 success tip），并入既有 Coach 流；② 热身坡道：`calculators.warmupRamp()` 按工作重量给 40/60/80% 阶梯（取整到可加载增量），落在 `PlateToolPanel`，凑重工具与 Focus 均可见。`svelte-check` 0 error，浏览器双态/双语已验。_

| ID              | 主题                             | ROI | 桶       | 投入 | Agent                            | 验收                                                   | Hub   |
| --------------- | -------------------------------- | --- | -------- | ---- | -------------------------------- | ------------------------------------------------------ | ----- |
| ~~**GYMS.MCP.1**~~ | ~~Fitness MCP~~ ✅ 2026-07-18 | — | — | — | — | `/api/mcp` today_training · recent_sessions · readiness_hint | ✅ |
| **GYMS.MEDIA.3** | 动作示意图                      | ○   | Product  | 2–3d | Fable                            | Focus 流可见缩略图                                     | —     |
| **GYMS.SYNC.4** | `SyncErrorPresentation` 契约对齐 | ○   | Platform | 1d   | Codex                            | PLAT.CORE.2                                            | —     |

**已完成：** GYMS.CORE.0 E2E 20/20 · GYMS.EVENTS.1 · **GYMS.PORTAL.2** · **GYMS.MCP.1**（AIOS 经 JWT 查今日/最近训练与恢复度粗提示）。

**2026-07-18：** MCP 舰队补齐第四站；维护模式不变，MEDIA.3 / SYNC.4 仍按需。

### 实现锚点

| ID    | 文件 / 位置                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| GYMS.CORE.0 | `playwright.config.js` · `vite.config.js`（port 5190）                                                       |
| GYMS.EVENTS.1 | 完练 hook → `life_events` insert；`packages/contracts/src/events.ts` 扩 schema；参考 `finance_bill_event_trigger`  |
| GYMS.PORTAL.2 | `20260710203000_portal_today_summary_fitness_today.sql` · `todaySummaryFormat.js` · `verify-ft-p2-prod.mjs` |
| GYMS.SUB.5 | `SkipModal.svelte` · `session.js` `skipExercise` · `FocusSession.svelte` · `program.js` `alternatives` · `sync.js` |

## 验收命令

```bash
cd apps/fitness
npm run dev                    # http://127.0.0.1:5190
CI=1 npm run test:e2e
npm run test:e2e:ci            # playwright.e2e-ci.config.js
npm run test:sync              # 同步逻辑脚本
```

## Parked / Not doing

实时多设备协同 · 完整周期化教练 SaaS · 与 Music/Home 强行联动

## 集成

```text
GYMS.EVENTS.1 ──produce──► life_events (fitness.workout_logged) ──► Planner PLNR.CORE.5
PORT.GROWTH.4 ──read──► fitness.fitness_workout_sessions
```
