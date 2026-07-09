# Home Roadmap

**URL：** [home.kenos.space](https://home.kenos.space) · **Workspace：** `home-os` · **层级：** 实验

## 一句话

户型 spatial 浏览/编辑 + 储藏清单；SSO ✅；**唯一无云业务数据**的 Life OS app（`homeos_spatial_v1` localStorage）。

## 当前能力（生产）

| 域           | 状态 | 要点                                       |
| ------------ | ---- | ------------------------------------------ |
| `/plan`      | ✅   | 浏览/编辑 · H-P5 · `test:viewport`         |
| `/storage`   | ✅   | 储藏区卡片 · `project.storageZones.length` |
| SSO / Portal | ✅   | H-P1–H-P3                                  |
| 云同步       | ❌   | H-P4 搁置                                  |
| 文档         | ❌   | 无 `apps/home/README.md`                   |

## Next（按 ROI）

| ID        | 主题                                            | ROI | 桶      | 投入   | 验收                                        | Hub |
| --------- | ----------------------------------------------- | --- | ------- | ------ | ------------------------------------------- | --- |
| **H-P6a** | 储藏区数上报 `core_*`（轻量，非 H-P4 全量同步） | ◆   | Growth  | 1d     | Portal G-P4b 可读；打开 Home 时 upsert 计数 | —   |
| **H-P6**  | Portal 卡：储藏区数 + 深链 `/storage`           | ◆   | Growth  | 0.5d   | 依赖 **H-P6a** 或「仅深链」降级             | —   |
| **H-P7**  | 多项目 localStorage 切换                        | ◆   | Product | 1–2d   | 设置页新建/切换户型                         | —   |
| **H-P9**  | 平面编辑首次引导                                | ○   | Product | 0.5–1d | `PlanShortcutsHelp` 首次显示                | —   |
| **H-P10** | `/plan` smoke（浏览↔编辑）                      | ○   | Infra   | 1d     | Playwright 或扩展现有 script                | —   |
| **H-P0**  | 补 `apps/home/README.md`                        | ○   | Docs    | 0.5h   | 实验边界与命令                              | —   |

### 实现锚点

| ID    | 文件 / 位置                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| H-P6a | `src/lib/state.svelte.js` · `storageZones` → `core_user_app_settings` 或 `core_profiles` JSON 元数据（需 migration 评估） |
| H-P7  | `homeos_spatial_v1` key 多项目命名                                                                                        |
| H-P10 | `scripts/plan-viewport-stress.mjs` 模式扩 smoke                                                                           |

## 验收命令

```bash
cd apps/home
npm run dev
npm run test:viewport        # H-P5 平面定位压力
npm run build
```

## Parked / Not doing（hub 硬规则）

| ID        | 说明                                                |
| --------- | --------------------------------------------------- |
| **H-P4**  | 全量 Supabase spatial 同步 — 每天用 Home 且换设备痛 |
| **H-P11** | life_events 储藏盘点 — 需 Planner 消费场景          |
| —         | 升四站同级 · Finance 表级资产同步                   |

## 集成

```text
Portal 实验卡 (H-P1) ──► home.kenos.space
H-P6a ──write──► core_* 元数据 ──read──► portal_today_summary (G-P4b)
localStorage ──► 平面/储藏真源（暂）
```
