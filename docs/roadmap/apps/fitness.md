# Fitness Roadmap

**URL：** [fitness.kenos.space](https://fitness.kenos.space) · **Workspace：** `fitness-os` · **Dev 端口：** 5190

## 一句话

Focus Mode 力量训练 + Coach Lite；Portal **G-P4** 已读最近完练；**`fitness.workout_logged` 已生产**（FT-P1 ✅）。

## 当前能力（生产）

| 域          | 状态 | 要点                                                          |
| ----------- | ---- | ------------------------------------------------------------- |
| Focus 训练  | ✅   | `/day/[id]/focus` · 组次/RIR · Summary                        |
| 计划/统计   | ✅   | `/program/edit` · `/stats`                                    |
| 云同步      | ✅   | `fitness` schema · 练完上传                                   |
| Integration | ✅   | SSO · Portal 摘要                                             |
| E2E         | ✅   | **20/20**（FT-P0 ✅）                                         |
| life_events | ✅   | `fitness.workout_logged` 触发器 + outbox 结构检查（FT-P1 ✅） |

## Next（按 ROI）

_**FT-P2** 已发货（2026-07-10）— Portal Fitness 卡 `workedOutToday`；migration `20260710203000` **远程已应用**；`verify-ft-p2-prod.mjs` PASS。_

| ID        | 主题                             | ROI | 桶       | 投入 | Agent                            | 验收                                                   | Hub   |
| --------- | -------------------------------- | --- | -------- | ---- | -------------------------------- | ------------------------------------------------------ | ----- |
| **FT-P5** | 替代动作完整训练流               | 🔥  | Product  | 2–3d | **Codex** 实现 · Fable 短 review | 跳过选替代 → Focus 练替代；Summary/Coach/容量归因；E2E | §Now  |
| **FT-P3** | 动作示意图                       | ○   | Product  | 2–3d | Fable                            | Focus 流可见缩略图                                     | —     |
| **FT-P4** | `SyncErrorPresentation` 契约对齐 | ○   | Platform | 1d   | Codex                            | C-P1+                                                  | —     |

**FT-P5 现状缺口：** `SkipModal` + `skipExercise(substituteId)` 仅**记录**替代 ID，未插入 Focus 训练流；周容量与 Coach 未按替代动作计组。程序数据里部分动作已有 `alternatives[]`（`program.js` / `exercises.js`），需补全覆盖 + 运行时切换。

**已完成：** FT-P0 E2E 20/20 · FT-P1 `fitness.workout_logged` → Planner 打卡 · **FT-P2** Portal `workedOutToday` ✅（migration 远程已应用）。

### 实现锚点

| ID    | 文件 / 位置                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| FT-P0 | `playwright.config.js` · `vite.config.js`（port 5190）                                                             |
| FT-P1 | 完练 hook → `life_events` insert；`packages/contracts/src/events.ts` 扩 schema；参考 `finance_bill_event_trigger`  |
| FT-P2 | `20260710203000_portal_today_summary_fitness_today.sql` · `todaySummaryFormat.js` · `verify-ft-p2-prod.mjs` |
| FT-P5 | `SkipModal.svelte` · `session.js` `skipExercise` · `FocusSession.svelte` · `program.js` `alternatives` · `sync.js` |

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
FT-P1 ──produce──► life_events (fitness.workout_logged) ──► Planner P-P5
G-P4 ──read──► fitness.fitness_workout_sessions
```
