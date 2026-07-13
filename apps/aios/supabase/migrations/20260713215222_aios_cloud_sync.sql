-- AI.OS · Life OS 统一 Supabase 项目 · aios schema
-- 云端同步:聊天会话 + 长期记忆,按用户隔离(RLS)。
-- 本地优先:客户端仍以 localStorage 为主,云端只做多设备同步的汇合点。
-- 时间戳用客户端毫秒(bigint),与本地 updatedAt/createdAt 同源,便于 LWW 合并。
-- 删除用墓碑(deleted=true)而非物理删除,离线设备重新上线时不会复活已删数据。
-- 注意:部署后需在 Dashboard → Settings → API 的 Exposed schemas 里加上 "aios"。

create schema if not exists aios;

-- 数据必须登录才可见:只授 authenticated(+ service_role),不授 anon
grant usage on schema aios to postgres, authenticated, service_role;
grant all on all tables in schema aios to authenticated, service_role;
alter default privileges in schema aios
  grant all on tables to authenticated, service_role;

create table if not exists aios.conversations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  payload jsonb,
  primary key (user_id, id)
);

create table if not exists aios.memories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  text text,
  created_at bigint not null default 0,
  deleted boolean not null default false,
  primary key (user_id, id)
);

alter table aios.conversations enable row level security;
alter table aios.memories enable row level security;

-- 每张表四条策略,全部限定本人行。
-- update 必须同时带 using + with check,否则行可被改挂到别的 user_id 下。
create policy "conversations_select_own" on aios.conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations_insert_own" on aios.conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations_update_own" on aios.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "conversations_delete_own" on aios.conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "memories_select_own" on aios.memories
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "memories_insert_own" on aios.memories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "memories_update_own" on aios.memories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "memories_delete_own" on aios.memories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists conversations_user_updated
  on aios.conversations (user_id, updated_at desc);
