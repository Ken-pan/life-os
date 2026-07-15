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

样式属性同时用于精化 kind：L形沙发→`sofa`、单人沙发→`armchair`、
茶几→`coffee_table`、转椅→`office_chair`、开放架→`shelf`（细分 kind
必须仍在 `placements.js PLACEMENT_KINDS` 词表内）。

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
