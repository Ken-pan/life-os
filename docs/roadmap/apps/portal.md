# Portal Roadmap

**URL：** [portal.kenos.space](https://portal.kenos.space) · **Workspace：** `portal` · **Dev 端口：** 5195

## 一句话

六站启动器 + `core_*` 读模型 + **五卡今日摘要**（含 Home 实验） + ⌘K 跨站深链；Growth **G-P1–G-P9 ✅**。

## 当前能力（生产）

| 域        | 状态 | 要点                                              |
| --------- | ---- | ------------------------------------------------- |
| Launcher  | ✅   | 四生产 + Home 实验（H-P1）                        |
| G-P1–G-P5 | ✅   | 继续 · 角标 · 默认跳转 · 摘要 · PWA 引导          |
| G-P4b-M   | ✅   | Music 第四卡 + `portal_today_summary` RPC         |
| G-P4b-H   | ✅   | Home 第五卡（储藏区数 · `/storage` 深链 · 实验标） |
| G-P6      | ✅   | ⌘K 14 深链 + `portal_cp_recent_v1`                |
| G-P8      | ✅   | pending → Planner `/inbox` 深链（角标 + 状态区）  |
| G-P9      | ✅   | `qa:smoke`（五卡）· `qa:screenshot`               |
| Auth / ⌘K | ✅   | Portal 内登录 · `CommandPalette` + icon registry  |

## Next（按 ROI）

_当前无阻塞 Growth 项；后续跨站摘要增量见 hub §Next（FT-P2 / P-P4）。_

## UI 走查（2026-07-09 · 第五轮 · P-1–P-12 ✅）

见 [`docs/qa/portal-screenshot-audit.md`](../../qa/portal-screenshot-audit.md)。

| ID  | 问题                | 状态   |
| --- | ------------------- | ------ |
| P-1 | CommandPalette 遮罩 | ✅ 已修 |
| P-2 | ICON_REGISTRY       | ✅ 已修 |
| P-3 | Music 摘要空状态    | ✅ M-P5 seed |
| P-4 | BrandMark 40px      | ✅ 已修 2026-07-09 |
| P-5 | Mobile 顶栏密度     | ✅ 已修 + **P-5b More sheet** 2026-07-09 |
| P-6 | svelte-check        | ✅ 已修 |
| P-7 | 角标/OS 叠影        | ✅ 已修 2026-07-09 |
| P-8 | 全页截图裁切线      | ✅ 已修 2026-07-09 |
| P-9 | 状态 pill 对比度    | ✅ 已修 2026-07-09 |
| P-10 | Home 第五卡        | ✅ G-P4b-H |
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
