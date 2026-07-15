-- HomeOS · Life OS 统一 Supabase 项目 · home schema（HOME.SYNC.4 首块：扫描同步）
-- iOS 扫描应用（RoomPlan）把整套户型扫描（墙体图/门窗/分区/家具/机位）转成
-- HomeOS plan-px 格式后写进 home.scans，网页端在设置页拉取并替换当前户型。
-- 本地优先:网页端仍以 localStorage 为主,云端只是 iPhone → 网页的单向汇合点。
-- 时间戳用客户端毫秒(bigint),与本地 updatedAt 同源;删除用墓碑(deleted=true)。
-- ⚠️ 部署后必须把 "home" 加进 PostgREST Exposed schemas(Dashboard → Settings → API,
--    或 Management API PATCH /v1/projects/<ref>/postgrest 的 db_schema),
--    否则所有 .schema('home') 调用一律 404。见 docs/ops/supabase.md。

create schema if not exists home;

-- 数据必须登录才可见:只授 authenticated(+ service_role),不授 anon
grant usage on schema home to postgres, authenticated, service_role;
grant all on all tables in schema home to authenticated, service_role;
alter default privileges in schema home
  grant all on tables to authenticated, service_role;

-- 一行 = 一次完整扫描。payload 是转换后的 HomeOS partial project
-- (formatVersion 1:wallGraph/graphOpenings/zones/placements/fixtures/viewpoints/meta,
--  照片与原始 CapturedStructure JSON 不进这里,走 home-scan-photos 桶按路径引用)。
create table if not exists home.scans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  device text,
  label text,
  payload jsonb,
  primary key (user_id, id)
);

alter table home.scans enable row level security;

-- 四条策略,全部限定本人行。
-- update 必须同时带 using + with check,否则行可被改挂到别的 user_id 下。
create policy "scans_select_own" on home.scans
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "scans_insert_own" on home.scans
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "scans_update_own" on home.scans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "scans_delete_own" on home.scans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists scans_user_updated
  on home.scans (user_id, updated_at desc);
