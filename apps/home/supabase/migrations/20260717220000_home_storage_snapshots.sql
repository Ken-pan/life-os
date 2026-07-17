-- HOME.MCP.13 — 储藏清单云端快照（给 /api/mcp where_is 读）。
-- 本地 homeos_spatial_v1 仍是编辑真源；本表是 RLS 保护的查询镜像，
-- 只存 where_is 需要的瘦身 storageZones（code/nameZh/items），不含户型几何。

create table if not exists home.storage_snapshots (
  user_id uuid primary key
    references auth.users (id) on delete cascade,
  project_id text not null,
  storage_zones jsonb not null default '[]'::jsonb,
  updated_at bigint not null
);

alter table home.storage_snapshots enable row level security;

create policy "storage_snapshots_select_own" on home.storage_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "storage_snapshots_insert_own" on home.storage_snapshots
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "storage_snapshots_update_own" on home.storage_snapshots
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "storage_snapshots_delete_own" on home.storage_snapshots
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on home.storage_snapshots to authenticated;
grant all on home.storage_snapshots to service_role;
