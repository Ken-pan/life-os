# HomeOS · Supabase（home schema）

Life OS 统一项目 `iueozzuctstwvzbcxcyh`。HomeOS 此前只用 `public.core_*` 身份；
`home` schema 是 HOME.SYNC.4 的第一块：iOS 扫描应用（`ios/home-scan/`）上传
RoomPlan 扫描，网页端设置页拉取。

## 表 / 桶

| 对象 | 用途 |
|---|---|
| `home.scans` | 一行一次完整扫描；`payload` jsonb = 转换后的 HomeOS partial project（formatVersion 1）；复合 PK `(user_id, id)`、客户端毫秒 `updated_at`、墓碑 `deleted` |
| Storage `home-scan-photos`（私有） | `{uid}/{scanId}/{uuid}.jpg` 机位照片；`{uid}/{scanId}/obj-{placementId}.jpg` 家具自动抓拍图（幂等定名）；`{uid}/{scanId}/structure.json` 原始 CapturedStructure；`{uid}/{scanId}/model.usdz` 3D 模型（真实空间模式，payload.raw.modelPath 指向）；RLS 按路径首段 = auth.uid() |

payload 契约与 iOS 端 `HomeScan/Convert/HomeOSModels.swift`、网页端
`apps/home/src/lib/cloud-scan.js` 三处同源，改动需三处同步。

### placement/fixture 的 `attrs`（2026-07 加法式扩展，formatVersion 仍为 1）

家具外观/实测补充信息，全部可选 —— 旧网页端不读该字段照常工作，旧 payload
没有该字段也照常拉取：

| 字段 | 含义 |
|---|---|
| `attrs.styleKeys` | RoomPlan iOS 17 样式属性，带枚举前缀（`"SofaType.lShaped"`、`"TableType.coffee"`…） |
| `attrs.styleZh` | 样式的人话（「L形」「圆形餐桌」「转椅」…）；VLM「识别外观」也会写 |
| `attrs.heightIn` | LiDAR 实测高度（英寸，`dimensions.y`） |
| `attrs.measuredWIn` / `attrs.measuredHIn` | LiDAR 实测平面脚印（英寸，与落盘时 w/h 一致）。w/h 之后可被用户拖改，这两个是不动的真值，网页端「恢复实测」靠它 |
| `attrs.confidence` | RoomPlan 识别置信度 `high\|medium\|low` |
| `attrs.colorHex` | 主色 `#RRGGBB`（设备端抓拍图 k-means，VLM 识别后覆盖） |
| `attrs.photoPath` | 家具抓拍图（最佳一张）桶内路径；网页端拉取后换成本地 `attrs.photoRef`（IndexedDB），`photoPath` 不落地 |
| `attrs.photos[]` | 多视角证据包：`{ path, azimuthDeg }`，按方位分 4 桶每桶最佳、分数降序（第一张 = photoPath 那张）；桶内定名 `obj-{id}-{k}.jpg`；网页端逐张换成 `photos[].photoRef` |
| `homeos.storageZones[]` | 储藏区规划（加法式，2026-07）：仅 `server-optimized` 优化副本携带（iPhone 不发）；replace 模式拉取时随户型落地，`placementId` 引用同 payload 的 placement id |

样式属性同时用于精化 kind：L形沙发→`sofa`、单人沙发→`armchair`、
茶几→`coffee_table`、转椅→`office_chair`、开放架→`shelf`（细分 kind
必须仍在 `placements.js PLACEMENT_KINDS` 词表内）。

### 柜内扫描（2026-07-15 加法式，桶内 JSON，不动表结构）

iOS「柜内扫描」（能力11：柜→层容器层级）把开柜门实测的内腔数据存进
`home-scan-photos` 桶、与扫描同前缀，**没有新表**——网页端按路径拉即可：

| 路径 | 内容 |
|---|---|
| `{uid}/{scanId}/container-{placementId}.json` | 柜内测量（formatVersion 1，见下）；重测同一柜子原地覆盖 |
| `{uid}/{scanId}/container-{placementId}-{k}.jpg` | 证据照（k=0 正面、k=1 斜侧） |

JSON 形状（源码 `ios/home-scan/HomeScan/Services/ContainerGeometry.swift` 的
`Payload`，改动需两处同步）：

```json
{
  "formatVersion": 1,
  "scanId": "…", "placementId": "p7", "placementLabel": "柜",
  "capturedAt": "2026-07-15T04:00:00Z", "device": "…",
  "interiorIn": { "w": 31.5, "d": 13.8, "h": 74.8 },
  "shelfHeightsIn": [24.4],
  "compartments": [
    { "level": 0, "y0In": 0, "y1In": 24.4, "heightIn": 24.4 },
    { "level": 1, "y0In": 24.4, "y1In": 74.8, "heightIn": 50.4 }
  ],
  "interiorVolumeL": 532,
  "photos": ["{uid}/{scanId}/container-p7-0.jpg", "…-1.jpg"]
}
```

- 单位英寸（与 `attrs.heightIn` 等一致）；`shelfHeightsIn`/`compartments`
  自内底向上；无层板时 `compartments` 只有一层。
- `measuredInteriorIn`（可选）：用户在确认页微调过尺寸才出现——
  `interiorIn` 是最终值（含人工修正），它是 AR 原始实测（能力19：
  修改值与原始测量都保留）；层高始终是实测，不随微调缩放。
- 这次 AR 会话与主扫描**不同世界系**——JSON 里只有相对尺寸可信，
  与户型的绑定完全靠 `placementId`（网页端合并家具时保持 id 稳定即可续接）。
- 网页端消费（2026-07-15 已接，`apps/home/src/lib/spatial/container-scan.js`）：
  储物页进入时自动同步（登录走 supabase；localhost dev 免登录走
  `/__dev/container-scans`，vite 中间件持钥）。绑定两段式——JSON 里的
  `placementId` 是**那次扫描**的家具 id，网页端合并保留旧 id，所以 id 直连
  不上时用 mapScanIntoLayout 配准 + scan-identity 匹配回当前户型家具，再顺
  储藏区 `placementId` 挂成 `zone.container`；物品新增 `level` 字段（0=最下层），
  搜索命中显示「S4 卧室柜体1 · 第 2 层」。未来加字段走加法式
  （如 `openingSide`、`accessDifficulty`）。

## 部署状态

- 2026-07-14：两个迁移已用 `scripts/supabase-sql.sh -f` 应用到生产并注册进
  `supabase_migrations.schema_migrations`；PostgREST `db_schema` / `db_extra_search_path`
  已追加 `home`（Management API PATCH）。验证：anon 带 `Accept-Profile: home` 查
  `scans` 返回 `42501 permission denied`（暴露成功且未授 anon）。

## 从零复现 / 新增迁移

1. **禁止** `supabase db push`（多 app 历史冲突）与 `migration repair --reverted`（会删真实历史）。
2. `./scripts/supabase-sql.sh -f apps/home/supabase/migrations/<file>.sql`
3. 注册版本：`insert into supabase_migrations.schema_migrations (version, name, statements) values (...) on conflict do nothing;`
4. 新 schema 才需要：PostgREST Exposed schemas 加名字（`GET/PATCH /v1/projects/<ref>/postgrest`，
   先 GET 现值再追加，勿覆盖其他 app）。漏这步 = 所有 `.schema('home')` 调用 404/PGRST106。
