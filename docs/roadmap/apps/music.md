# Music Roadmap

**URL：** [music.kenos.space](https://music.kenos.space) · **Workspace：** `music-os` · **Dev 端口：** 5189

## 一句话

本地优先播放器 + 云曲库；**M-P1 ✅** `play_events`（167 行）喂推荐管道。

## 当前能力（生产）

| 域          | 状态 | 要点                                                                          |
| ----------- | ---- | ----------------------------------------------------------------------------- |
| 播放/曲库   | ✅   | IndexedDB + Supabase Storage                                                  |
| play_events | ✅   | 生产写入 · RPC 推荐部分接入                                                   |
| 推荐 UI     | 🟡   | v6 RPC 已读 `play_events`；有 reasons 时 Queue 已展示（`recommendations.js`） |
| 标签        | 🟡   | 243 ready / 25 partial                                                        |
| E2E         | ✅   | `test:sw:full` 21/21 · `qa:ui-flow` 15/15 ✅（**M-P2**）                     |

## Next（按 ROI）

| ID               | 主题                         | ROI | 桶      | 投入 | 验收                  | Hub      |
| ---------------- | ---------------------------- | --- | ------- | ---- | --------------------- | -------- |
| **M-P2** {#m-p2} | UI E2E                       | ✅  | Infra   | 1–2d | `npm run qa:ui-flow`  | §Shipped 2026-07-09 |
| **M-P5**         | 验收 v6 行为分效果           | ✅  | Product | —    | `qa:rec-behavior` 6/6 · M5 seed | §Shipped |
| **M-P7**         | Portal **G-P4b-M** 最近播放  | ✅  | Growth  | —    | 与 Portal 同批                  | §Shipped |
| **M-P4**         | debug 全量预览（开发）       | ○   | Product | 0.5d | `musicos:debug-rec`   | —        |

### 实现锚点

| ID   | 文件 / 位置                                                                |
| ---- | -------------------------------------------------------------------------- |
| M-P2 | 新建 `tests/` 或 `scripts/qa-ui-flow.mjs`；参考 Finance `ia-nav-qa.mjs`    |
| M-P4 | `src/lib/ui.svelte.js` · `REC_DEBUG_STORAGE_KEY` / `recommendationPreview` |
| M-P7 | 扩 `portal_today_summary` 查 `music.play_events`                           |

## 验收命令

```bash
cd apps/music
npm run dev
npm run test:sw:full         # SW E2E 21/21
npm run qa:ui-flow           # M-P2 UI 流 15/15
npm run check
```

## Parked / Not doing

**M-P3** LLM 补标 · 全库 pgvector · `life_events`（无消费者）

## 集成

```text
play_events ──► 推荐 RPC（站内）
G-P4b ──read──► music.play_events（M-P7）
```
