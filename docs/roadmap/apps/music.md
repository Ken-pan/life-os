# Music Roadmap

**URL：** [music.kenos.space](https://music.kenos.space) · **Workspace：** `music-os` · **Dev 端口：** 5189

## 一句话

本地优先播放器 + 云曲库；**MUSC.CORE.1 ✅** `play_events`（167 行）喂推荐管道。

## 当前能力（生产）

| 域          | 状态 | 要点                                                                                         |
| ----------- | ---- | -------------------------------------------------------------------------------------------- |
| 播放/曲库   | ✅   | IndexedDB + Supabase Storage；**MUSC.PLAY.8** 播放加载 Phase A–D（signed URL / SW / IDB / metrics） |
| play_events | ✅   | 生产写入 · RPC 推荐部分接入                                                                  |
| 推荐 UI     | 🟡   | v6 RPC 已读 `play_events`；有 reasons 时 Queue 已展示（`recommendations.js`）                |
| 标签        | 🟡   | 243 ready / 25 partial                                                                       |
| E2E         | ✅   | `test:sw:full` 21/21 · `qa:ui-flow` 15/15 ✅（**MUSC.UI.2**）                                     |

## Next（按 ROI）

| ID               | 主题                        | ROI | 桶      | 投入 | 验收                            | Hub                 |
| ---------------- | --------------------------- | --- | ------- | ---- | ------------------------------- | ------------------- |
| **MUSC.PIPE.4**         | debug 全量预览（开发）      | ○   | Product | 0.5d | `musicos:debug-rec`             | —                   |

**已完成：** MUSC.UI.2 UI E2E · MUSC.PIPE.5 行为分 6/6 · MUSC.PORTAL.7 Portal 最近播放 · MUSC.PLAY.8 播放加载 Phase A–D。

### MUSC.PLAY.8 播放加载 Phase D（个人私有）

**已落地：** playMetrics（本机环形缓冲）· Settings 调试读数 · SW/IDB 去重 · IDB idle hydrate · signed URL 静默续期 · Quick Picks `visibleWarm` · 离线未缓存提示。

**真机停手条件：**

| 指标                       | 继续投入           | 停手                         |
| -------------------------- | ------------------ | ---------------------------- |
| 重复播放 P95 >500ms        | 提 IDB 上限        | —                            |
| 冷启动 P95 >2s             | 评估本地 blob 优先 | —                            |
| 冷启动 <1.5s 且重复 <300ms | —                  | 加载主线归档，转 MUSC.PIPE.4 / 标签 |

**验收：**

1. Settings →「播放加载指标」有样本与 P50/P95
2. 同一云曲播放两次，第二次来源应为 `idb` / `blob`
3. 长挂 >55min 后切歌不因 URL 过期失败（静默续期）
4. 离线点未缓存曲目：MiniPlayer / statusHint 显示「离线且未缓存此曲」

### 实现锚点

| ID   | 文件 / 位置                                                                          |
| ---- | ------------------------------------------------------------------------------------ |
| MUSC.PLAY.8 | `playMetrics.js` · `audioBlobStore.js` · `audioWarm.js` · `cloudAudio.js` · Settings |
| MUSC.UI.2 | 新建 `tests/` 或 `scripts/qa-ui-flow.mjs`；参考 Finance `ia-nav-qa.mjs`              |
| MUSC.PIPE.4 | `src/lib/ui.svelte.js` · `REC_DEBUG_STORAGE_KEY` / `recommendationPreview`           |
| MUSC.PORTAL.7 | 扩 `portal_today_summary` 查 `music.play_events`                                     |

## 验收命令

```bash
cd apps/music
npm run dev
npm run test:sw:full         # SW E2E 21/21
npm run qa:ui-flow           # MUSC.UI.2 UI 流 15/15
npm run check
```

## Parked / Not doing

**MUSC.PIPE.3** LLM 补标 · 全库 pgvector · `life_events`（无消费者）
Public bucket / MSE·HLS / Gapless-5 Web Audio 混合（个人 app 暂不换栈）

## 集成

```text
play_events ──► 推荐 RPC（站内）
PORT.GROWTH.4b ──read──► music.play_events（MUSC.PORTAL.7）
```
