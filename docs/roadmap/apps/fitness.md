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
| **FT-P5** | 替代动作完整训练流               | 🔥  | Product  | UI closure | **Codex** 实现 ✅ · product re-review 待 UI | 工程 gate **PASS** · 产品 gate **BLOCKED** — [`FT-P5-substitution.md`](../../../apps/fitness/docs/FT-P5-substitution.md) | §Now  |
| **FT-P3** | 动作示意图                       | ○   | Product  | 2–3d | Fable                            | Focus 流可见缩略图                                     | —     |
| **FT-P4** | `SyncErrorPresentation` 契约对齐 | ○   | Platform | 1d   | Codex                            | C-P1+                                                  | —     |

**FT-P5 进度（2026-07-11）：** 状态模型与归因 **工程 gate PASS**（`sessionQueue.js` · focused tests 8/8）；**产品 gate BLOCKED** — 替代选中态几乎不可见（P0）+ modal/Summary 文案待修。详见 [`FT-P5-substitution.md`](../../../apps/fitness/docs/FT-P5-substitution.md)。

**剩余 closure（bounded UI/copy）：** 见 [`FT-P5-ui-closure-guide.md`](../../../apps/fitness/docs/FT-P5-ui-closure-guide.md) — **推荐方案 1**（背景高亮 + `aria-pressed`）；PR-A 解 P0 → PR-B 文案 → PR-C Focus 标签 → product re-review。

**已完成：** FT-P0 E2E 20/20 · FT-P1 `fitness.workout_logged` → Planner 打卡 · **FT-P2** Portal `workedOutToday` ✅（migration 远程已应用）。

### 实现锚点

| ID    | 文件 / 位置                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| FT-P0 | `playwright.config.js` · `vite.config.js`（port 5190）                                                             |
| FT-P1 | 完练 hook → `life_events` insert；`packages/contracts/src/events.ts` 扩 schema；参考 `finance_bill_event_trigger`  |
| FT-P2 | `20260710203000_portal_today_summary_fitness_today.sql` · `todaySummaryFormat.js` · `verify-ft-p2-prod.mjs` |
| FT-P5 | `sessionQueue.js` · `session.js` · `SkipModal.svelte` · `FocusSession.svelte` · `SummaryView.svelte` · `stats.js` · `progression.js` · `coachMetrics.js` · [`FT-P5-substitution.md`](../../../apps/fitness/docs/FT-P5-substitution.md) |

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
