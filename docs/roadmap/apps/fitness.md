# Fitness Roadmap

**URL：** [fitness.kenos.space](https://fitness.kenos.space) · **Workspace：** `fitness-os` · **Dev 端口：** 5190

## 一句话

Focus Mode 力量训练 + Coach Lite；Portal **G-P4** 已读最近完练；**尚未生产 `life_events`**。

## 当前能力（生产）

| 域          | 状态 | 要点                                              |
| ----------- | ---- | ------------------------------------------------- |
| Focus 训练  | ✅   | `/day/[id]/focus` · 组次/RIR · Summary            |
| 计划/统计   | ✅   | `/program/edit` · `/stats`                        |
| 云同步      | ✅   | `fitness` schema · 练完上传                       |
| Integration | ✅   | SSO · Portal 摘要                                 |
| E2E         | 🟡   | 5190 已对齐；**F-1** 默认 config 仍易踩坑         |
| life_events | ❌   | 契约测试有 `fitness.workout_logged`，runtime 未接 |

## Next（按 ROI）

| ID                 | 主题                                          | ROI | 桶       | 投入 | 验收                         | Hub                |
| ------------------ | --------------------------------------------- | --- | -------- | ---- | ---------------------------- | ------------------ |
| **FT-P0**          | E2E：`reuseExistingServer: !CI` + 文档化 5190 | 🔥  | Infra    | 0.5d | 冷启动 `npm run test:e2e` 绿 | —                  |
| **FT-P1** {#ft-p1} | 完练 → outbox `fitness.workout_logged`        | ◆   | Growth   | 2–3d | outbox smoke + Planner inbox | ✅ §Next (I-P1.5b) |
| **FT-P2**          | Portal 摘要「今日是否已练」                   | ◆   | Growth   | 0.5d | 扩 `portal_today_summary`    | —                  |
| **FT-P3**          | 动作示意图                                    | ○   | Product  | 2–3d | Focus 流可见缩略图           | —                  |
| **FT-P4**          | `SyncErrorPresentation` 契约对齐              | ○   | Platform | 1d   | C-P1+                        | —                  |

### 实现锚点

| ID    | 文件 / 位置                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| FT-P0 | `playwright.config.js` · `vite.config.js`（port 5190）                                                            |
| FT-P1 | 完练 hook → `life_events` insert；`packages/contracts/src/events.ts` 扩 schema；参考 `finance_bill_event_trigger` |
| FT-P2 | `20260708190000_portal_today_summary_rpc.sql` 扩字段                                                              |

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
