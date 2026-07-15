# HomeOS · Supabase（home schema）

Life OS 统一项目 `iueozzuctstwvzbcxcyh`。HomeOS 此前只用 `public.core_*` 身份；
`home` schema 是 HOME.SYNC.4 的第一块：iOS 扫描应用（`ios/home-scan/`）上传
RoomPlan 扫描，网页端设置页拉取。

## 表 / 桶

| 对象 | 用途 |
|---|---|
| `home.scans` | 一行一次完整扫描；`payload` jsonb = 转换后的 HomeOS partial project（formatVersion 1）；复合 PK `(user_id, id)`、客户端毫秒 `updated_at`、墓碑 `deleted` |
| Storage `home-scan-photos`（私有） | `{uid}/{scanId}/{uuid}.jpg` 机位照片；`{uid}/{scanId}/structure.json` 原始 CapturedStructure；RLS 按路径首段 = auth.uid() |

payload 契约与 iOS 端 `HomeScan/Convert/HomeOSModels.swift`、网页端
`apps/home/src/lib/cloud-scan.js` 三处同源，改动需三处同步。

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
