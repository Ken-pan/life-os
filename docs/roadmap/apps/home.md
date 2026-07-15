# Home Roadmap

**URL：** [home.kenos.space](https://home.kenos.space) · **Workspace：** `home-os` · **层级：** 实验

## 一句话

户型 spatial 浏览/编辑 + 储藏清单；SSO ✅；**唯一无云业务数据**的 Life OS app（`homeos_spatial_v1` localStorage）。

## 当前能力（生产 / 本地）

| 域           | 状态 | 要点                                       |
| ------------ | ---- | ------------------------------------------ |
| `/plan`      | ✅   | 508 浏览/编辑 · 墙图单工具面板 · HOME.PROJ.5 `test:viewport` |
| `/plan` 墙图 | ✅   | HOME.SPATIAL.0–W5 ✅ · Wave A/B/C UX · `test:plan-edit`（**13 checks**） |
| `/storage`   | ✅   | 储藏区卡片 · `?zone=` 深链 · **HOME.STORAGE.12 物品实体化 + 搜索定位 + CRUD** |
| SSO / Portal | ✅   | HOME.PORTAL.1–HOME.SSO.3 · HOME.PROJ.6 储藏卡                    |
| 文档         | ✅   | [`apps/home/README.md`](../../../apps/home/README.md) |
| 云同步       | ❌   | HOME.PROJ.4 搁置                                  |

## 空间编辑 Workstream（H-W，主线）

编辑器：**一个工具面板**（选择 / 建墙 / 门窗 / 画区 / 家具 / 标储藏 / 视角），按工作流分组。墙图为 SSOT，门窗挂墙边（`graphOpenings`）。  
> **2026-07-14 UI 重构：** 原「① 墙体 → ② 划分 → ③ 布置」步骤段已移除 —— 它与浮动面板是同一份状态的两个控件，且 ② 的「删区 / 自动识别房间」在桌面端根本点不到。现由 `activeTool` 单一真源驱动，步骤语义降为内部 `$derived`。详见 [`apps/home/README.md` §工具面板](../../../apps/home/README.md)。  
执行方案 → **[home-spatial-editor.md](./home-spatial-editor.md)**  
功能验收 → **[home-spatial-editor-audit-2026-07-08.md](../../qa/home-spatial-editor-audit-2026-07-08.md)**  
UI/UX 验收 → **[home-spatial-uiux-audit-2026-07-08.md](../../qa/home-spatial-uiux-audit-2026-07-08.md)**

| ID        | 主题                                | 状态 | 依赖        |
| --------- | ----------------------------------- | ---- | ----------- |
| **HOME.SPATIAL.0**  | 地基：恢复墙图 hydrate + 三步壳     | ✅   | —           |
| **HOME.SPATIAL.1**  | ① 墙体：建/删/选/拖点/分割 + 撤销   | ✅   | HOME.SPATIAL.0        |
| **HOME.SPATIAL.2**  | ①b 门窗：挂边开口 + 508 转换        | ✅   | HOME.SPATIAL.1        |
| **HOME.SPATIAL.2b** | 手机编辑壳 + hint 去重                | ✅   | HOME.SPATIAL.2        |
| **HOME.SPATIAL.2c** | §5.3 沿墙拖/改宽/门↔窗 + smoke 8    | ✅   | HOME.SPATIAL.2        |
| **Wave UX** | UX-01–22 主项 + A11Y-01/03        | ✅   | HOME.SPATIAL.2c       |
| **HOME.SPATIAL.3**  | ② 划分：手绘多边形分区              | ✅   | HOME.SPATIAL.1        |
| **HOME.SPATIAL.4**  | ③ 布置：家具 + 储藏指派（S1–S8）    | ✅   | HOME.SPATIAL.3        |
| **HOME.SPATIAL.5**  | 迁移 / smoke 全量 / 文档 / 生产走查 | ✅   | HOME.SPATIAL.4        |

**H-W 已交付（2026-07-08）：** schema v3 · 三步编辑器 · `zones[]`/`placements[]` · 储藏指派 · smoke **13 checks**。

过渡保障：`/storage?zone=…` 深链不断；设置页「返回 508」安全气囊；墙图浏览标注「508 参数快照」。

## 智能家居 Workstream（HOME.DEVICE.* · 研判中）

**脑暴日期：** 2026-07-14 · **状态：** Discovery，**全部未开工，未进 hub §Next**（按 [`MAINTENANCE.md`](../../MAINTENANCE.md) §更新流程 4：未评估不得进 Now）。
**前置 gate：** `HOME.DEVICE.12` — 它的结果决定下面还剩几项可做；在它之前排期都是空想。

### 定位（先划线）

**不做第 N 个遥控器。** 开关灯 Govee / Google Home 已解决，重做只会得到一个更差、且要自己维护的版本；定位成「统一控制面板」的 Home OS 会在第三次懒得打开时死掉。

Home 独有、买不到的是**几何**：墙图 + `zones[]` + `placements[]`（schema v3）。全世界的智能家居 app 只有扁平设备列表（「客厅灯 1」「客厅灯 2」）。支点是一句话——

> **给设备一个坐标，墙图就从一张画变成一张活地图。**

六 app 分管时间（Planner）/ 身体（Fitness）/ 钱（Finance）/ 声音（Music）/ 大脑（AIOS）；**Home 管空间**——这一维目前是空的，且是唯一能给其他 app 提供物理世界上下文的地方。

### 设备接入：只写一个适配器

逐厂商写适配器是陷阱（各自鉴权 / 限流 / 半年一次 breaking change → 五个半死不活的集成）。本机跑一个 **Home Assistant**（Docker 或 Pi）扛所有厂商，Home OS 只跟它的 WS/REST 说话：**五个适配器变成一个**。与 local-ai 网关同构——一个本地服务托管上游，应用只认网关。

| 设备            | 假设（**全部待 `HOME.DEVICE.12` 验证，勿直接采信**）                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Govee           | 大概率最顺；官方 Developer API，部分型号支持局域网直控（需在 Govee app 手动开 LAN Control）                                                 |
| Nest 摄像头     | 走 Google Smart Device Management API，疑似需一次性付费注册开发者项目；**较新电池款可能只给 WebRTC 无 RTSP** —— 直接决定 `HOME.VISION.15` 生死，优先验 |
| amaran 等杂牌灯 | 若是 Aputure 线摄影灯，主控为 Sidus Link BLE/2.4G，基本无可用 API                                                                           |

**取舍规则：** 能不能进 Home Assistant / 走 Matter / 走局域网。进不来的**不为其设计**，接受「有些灯就是手动开」——为一盏灯做逆向工程是负 ROI。

### 目标架构

```text
Govee / Nest / Aqara / 杂牌 ──► Home Assistant（本机，唯一适配层）
                                      │ WS / REST
                              Home OS（空间真源：墙图 + 分区 + 储藏 + 设备坐标）
                                      │
        ┌─────────────────────────────┼──────────────────────────┐
        │ /api/mcp                    │ life_events              │ core_*
        ▼                             ▼                          ▼
      AIOS                     Planner（耗材/维护待办）        Portal 卡片
   （本地推理 / 主动性）                                        Finance（能耗归因）
```

### 分项

| ID                  | 主题                        | ROI  | 桶      | 投入   | 依赖      | 说明 / 验收                                                                                                              |
| ------------------- | --------------------------- | ---- | ------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| **HOME.DEVICE.12**  | 设备摸底（HA spike）        | 🔥   | Infra   | 0.5d   | —         | **前置 gate**；HA 装起来，记录 Govee / Nest 实际能拿到什么（尤其 Nest 有无帧 / RTSP）；产出替换上表「假设」列             |
| **HOME.MCP.13**     | `/api/mcp` + `where_is`     | ◆◆   | Product | 1–2d   | （19）    | **不依赖硬件，可与 12 并行**；`@life-os/mcp-server` 底座已在 → 挂 tool handler，AIOS 配个 URL 即入 agent loop，不改 AIOS 源码；`where_is` 可直接薄封装 .19 的 `searchStorageItems()` |
| **HOME.DEVICE.14**  | 墙图设备坐标（设备 ↔ zone） | ◆    | Product | —      | 12        | 复用 `placements` 编辑器 → 解锁空间寻址（「把沙发那边调暗」不需记设备名）                                                 |
| **HOME.VISION.15**  | 本地 VLM 看摄像头           | ◆/✗  | Product | —      | 12        | **押在 12 的结果**：拿不到帧则整项废；见下 §为什么押 VLM                                                                  |
| **HOME.STORAGE.18** | VLM 储藏盘点                | ○    | Product | —      | 15 · 19   | 拍柜子 → VLM 列物品 → `addStorageItem()` 写回 `/storage` 清单（.19 已备好实体写入口）；**消掉 `HOME.STORAGE.11` 被 park 的录入成本** |
| **HOME.ENERGY.16**  | 能耗归因 → Finance          | ○    | Product | —      | 12 · 14   | 电费账单（Finance 已管账单）对照设备开机时长，归到房间；**Home 独有、Finance 自己算不出的数据**                           |
| **HOME.SCENE.17**   | `life_events` → 场景        | ○    | Product | —      | 12        | `fitness.workout_logged` 契约已在 → 完练后训练区降温 / 切灯；Planner 日程 → 离家 / 回家                                   |

**建议顺序：** `HOME.DEVICE.12`（先做，半天）→ `HOME.MCP.13`（不碰硬件，风险最低，立刻能用）→ `HOME.DEVICE.14` → `HOME.VISION.15` → `HOME.STORAGE.18` / `HOME.ENERGY.16` / `HOME.SCENE.17`（前面没跑通则无意义）。

### 为什么 `HOME.MCP.13` 排在硬件前面

`/storage` 清单 `HOME.STORAGE.19` 后已能在 app 内搜到并定位到平面图，但**跨 app 仍没有消费方**。接进 AIOS 后第一次有人问「我的登山包在哪」，清单从自用索引变成全局索引。这是 Google Home 永远答不了、而底座（`packages/mcp-server`）已经躺在仓库里的一条。对比 AIOS.20/21 的硬编码集成：**新增跨 app 能力 = 写几个 tool handler**。

### 为什么押 VLM

AIOS 已有本地 VLM（vlm-fast / vlm-quality）。Google 要 Nest Aware 订阅才给「是人还是包裹」的识别，且画面全上云；**帧丢给本机 VLM = 同样的能力，免费，且画面不出这台 Mac** —— 与 AIOS「数据不出设备」立场同构，不是硬凑。

- 「快递到了吗」→ 抓一帧，本地判断。
- 摄像头事件 → VLM 过滤 → 有意义的才推原生通知（AIOS.22 通知通道已在）。真正杀掉的是「树叶动了也提醒你」这个人人都关掉的功能。
- `HOME.STORAGE.18`：VLM 恰好消掉储藏盘点的录入成本 —— 这是 `HOME.STORAGE.11` 当初被 park 的主因。

### 风险 / 边界

| 项           | 判断                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **云同步**   | Home 现为唯一无云业务数据 app，`HOME.PROJ.4` park 判断**维持**。折中：**不同步墙图，只同步「设备 ↔ zone 映射」**——设备实时状态真源在 HA，Home 不该存；映射是 Home 独有的那一小份语义，量小，同步它 ≠ 做掉 `HOME.PROJ.4` |
| **控制面板** | 不做（见 §定位）                                                                                                                                                                                      |
| **杂牌设备** | 不做（见 §取舍规则）                                                                                                                                                                                  |

## 储藏 Workstream（HOME.STORAGE）

储物从**只读展示**升级为**可用库存**。对标 HomeBox / Sortly / ToteScan：它们都只有文字列表 + QR 码贴箱子找东西；HomeOS 有真实户型图，所以主押「搜到物品 → 平面图直接高亮所在区」这条它们做不到的路径，而非照抄 QR 扫码。

| ID                  | 主题                                     | 状态          | 依赖 |
| ------------------- | ---------------------------------------- | ------------- | ---- |
| **HOME.STORAGE.19** | 物品实体化(schema v4) + CRUD + 搜索定位  | ✅ 2026-07-14 | —    |
| **HOME.STORAGE.20** | 容器层级（区 → 箱 → 物，HomeBox 式嵌套） | ⬜ 未排       | 19   |
| **HOME.STORAGE.21** | 囤货：数量阈值 / 低库存提醒 / 补货清单   | ⬜ 未排       | 19   |
| **HOME.STORAGE.22** | CSV / JSON 导出（保险、搬家）            | ⬜ 未排       | 19   |

**.19 已交付：** `items: string[]` → `SpatialStorageItem[]`（hydrate 时自动幂等迁移）· 增/删/改/移动 + 撤销 · 全局搜索（名称/标签/备注，多词 AND，名称匹配优先）· 命中即高亮平面图并筛选清单 · `test:storage` 单测 + `test:storage-ui` smoke（19 checks）。

验收 → **[home-storage-audit-2026-07-14.md](../../qa/home-storage-audit-2026-07-14.md)**（4 个真问题已修；含一个 `check`/`build` 抓不到的死 CSS 坑）。

**.19 解锁的两项：**

- **`HOME.MCP.13` `where_is`** —— 「我的登山包在哪」原先要在 `string[]` 里做子串匹配、且无法回指具体物品；现在 `searchStorageItems()` 直接返回 `{ item, zoneCode, zoneNameZh }`，tool handler 基本是薄封装。
- **`HOME.STORAGE.18` VLM 盘点** —— 「拍柜子 → VLM 列物品 → 写回 `/storage`」现在有了真正的写入目标（`addStorageItem(code, name, { qty, tags })`），不必先造实体层。

## Next（按 ROI）

| ID        | 主题                                            | ROI | 桶      | 投入   | 验收                                        |
| --------- | ----------------------------------------------- | --- | ------- | ------ | ------------------------------------------- |
| **HOME.PROJ.7**  | 多项目 localStorage 切换                        | ◆   | Product | 1–2d   | **建议 HOME.SPATIAL.5 后**                            |
| **HOME.ONBOARD.9**  | 平面编辑首次引导                                | ○   | Product | 0.5–1d | `PlanShortcutsHelp`  onboarding             |
| **HOME.SMOKE.10** | `/plan` smoke 扩面（508 转换 9 门窗 TST-01）    | ○   | Infra   | 0.5d   | `test:plan-edit` 或独立脚本                 |

> **`HOME.DEVICE.*` 智能家居线**（2026-07-14 脑暴）研判中、**未进本表** —— 须先过 `HOME.DEVICE.12` 设备摸底，见 [§智能家居 Workstream](#智能家居-workstreamhomedevice--研判中)。

### 实现锚点

| ID    | 文件 / 位置                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| H-W*  | [home-spatial-editor.md](./home-spatial-editor.md) · [graph-openings.js](../../../apps/home/src/lib/spatial/graph-openings.js) |
| QA    | [home-spatial-editor-audit](../../qa/home-spatial-editor-audit-2026-07-08.md) · [uiux-audit](../../qa/home-spatial-uiux-audit-2026-07-08.md) |
| HOME.PROJ.6a | `homePortalMetadata.js` · `packages/sync/src/homePortalMetadata.js`                                                       |

## 验收命令

```bash
cd apps/home
npm run dev -- --port 5197
npm run test:viewport        # 508 模式定位（67 checks）
npm run test:plan-edit       # 墙图 smoke（8 checks）
npm run build
node scripts/qa-ui-screenshots.mjs   # UI/UX 截图（可选）
```

## Parked / Not doing

| ID        | 说明                                                |
| --------- | --------------------------------------------------- |
| **HOME.PROJ.4**  | 全量 Supabase spatial 同步 —— park **维持**；若走 `HOME.DEVICE.14`，只同步「设备 ↔ zone 映射」这一小份，不等于解 park（见 §风险 / 边界） |
| **HOME.STORAGE.11** | life_events 储藏盘点 —— park 主因是**录入成本**；`HOME.VISION.15` 若成立则由 `HOME.STORAGE.18`（VLM 盘点）消掉该成本，届时值得重评 |

## 集成

```text
Portal 实验卡 (HOME.PORTAL.1) ──► home.kenos.space
localStorage ──► 平面/储藏真源（暂）

研判中（HOME.DEVICE.* · 未开工）：
Home Assistant ──► Home OS ──/api/mcp──► AIOS
                          ├──life_events──► Planner
                          └──core_*───────► Portal / Finance
```
