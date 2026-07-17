# Portal Roadmap

**URL：** [portal.kenos.space](https://portal.kenos.space) · **Workspace：** `portal` · **Dev 端口：** 5195

## 一句话

六站启动器 + `core_*` 读模型 + **五卡今日摘要**（含 Home 实验） + ⌘K 跨站深链；Growth **PORT.GROWTH.1–PORT.GROWTH.9 ✅**。

## 当前能力（生产）

| 域        | 状态 | 要点                                              |
| --------- | ---- | ------------------------------------------------- |
| Launcher  | ✅   | 四生产 + Home 实验（HOME.PORTAL.1）                        |
| PORT.GROWTH.1–PORT.GROWTH.5 | ✅   | 继续 · 角标 · 默认跳转 · 摘要 · PWA 引导          |
| PORT.GROWTH.4b-M   | ✅   | Music 第四卡 + `portal_today_summary` RPC         |
| PORT.GROWTH.4b-H   | ✅   | Home 第五卡（储藏区数 · `/storage` 深链 · 实验标） |
| PORT.GROWTH.6      | ✅   | ⌘K 14 深链 + `portal_cp_recent_v1`                |
| PORT.GROWTH.8      | ✅   | pending → Planner `/inbox` 深链（角标 + 状态区）  |
| PORT.GROWTH.9      | ✅   | `qa:smoke`（五卡）· `qa:screenshot`               |
| Auth / ⌘K | ✅   | Portal 内登录 · `CommandPalette` + icon registry  |

## Next（按 ROI）

_当前无阻塞 Growth 项，保持 maintenance。AIOS / KnowledgeOS / HealthOS 不因“九 app”自动加卡；只有出现每日启动需求或可消费摘要时才扩 Portal。_

**近期已发货：** **GYMS.PORTAL.2** ✅（2026-07-10）— `portal_today_summary` 扩 `workedOutToday` / `todayCompleted` · Portal 卡文案 · migration `20260710203000` **远程已应用** · `verify-ft-p2-prod.mjs`。

_**PLNR.CORE.4** 已于 2026-07-13 发货（Planner Today ↔ Portal 计数口径对齐）。AIOS / KnowledgeOS / HealthOS 尚未进入 Portal，是否增加入口需先明确 Portal 信息密度与消费者价值。_

**运维教训（2026-07-14）：** Portal 生产曾静默停更两天——publish 路径被两个消费者互相覆盖 + Netlify ignore 规则漏掉共享包依赖；已修（`901bfee93` · `750a3b7f2`），共享包改动现在会正确触发六站重建。

## UI 走查（2026-07-09 · 第五轮 · P-1–P-12 ✅）

见 [`docs/qa/portal-screenshot-audit.md`](../../qa/portal-screenshot-audit.md)。

| ID  | 问题                | 状态   |
| --- | ------------------- | ------ |
| P-1 | CommandPalette 遮罩 | ✅ 已修 |
| P-2 | ICON_REGISTRY       | ✅ 已修 |
| P-3 | Music 摘要空状态    | ✅ MUSC.PIPE.5 seed |
| P-4 | BrandMark 40px      | ✅ 已修 2026-07-09 |
| P-5 | Mobile 顶栏密度     | ✅ 已修 + **P-5b More sheet** 2026-07-09 |
| P-6 | svelte-check        | ✅ 已修 |
| P-7 | 角标/OS 叠影        | ✅ 已修 2026-07-09 |
| P-8 | 全页截图裁切线      | ✅ 已修 2026-07-09 |
| P-9 | 状态 pill 对比度    | ✅ 已修 2026-07-09 |
| P-10 | Home 第五卡        | ✅ PORT.GROWTH.4b-H |
| P-11 | 五卡网格空位       | ✅ 已修 2026-07-09 |
| P-5b | More sheet         | ✅ 已修 2026-07-09 |
| P-12 | 实验卡虚线边框     | ✅ 已修 2026-07-09 |

## QA

```bash
cd apps/portal
npm run test:cp && npm run check
npm run preview -- --host 127.0.0.1 --port 5195
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:smoke
PORTAL_QA_URL=http://127.0.0.1:5195 npm run qa:screenshot
```

## 相关

- [`GROWTH.md`](../GROWTH.md) · [`INTEGRATION.md`](../INTEGRATION.md#i-p1) · [`SHIPPED.md`](../SHIPPED.md)
