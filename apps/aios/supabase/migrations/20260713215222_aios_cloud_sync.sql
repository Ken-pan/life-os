-- AIOS 云端同步:聊天会话 + 长期记忆,按用户隔离(RLS)。
-- 本地优先:客户端仍以 localStorage 为主,云端只做多设备同步的汇合点。
-- 时间戳用客户端毫秒(bigint),与本地 updatedAt/createdAt 同源,便于 LWW 合并。
-- 删除用墓碑(deleted=true)而非物理删除,离线设备重新上线时不会复活已删数据。

create table public.aios_conversations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  payload jsonb,
  primary key (user_id, id)
);

create table public.aios_memories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  text text,
  created_at bigint not null default 0,
  deleted boolean not null default false,
  primary key (user_id, id)
);

alter table public.aios_conversations enable row level security;
alter table public.aios_memories enable row level security;

-- 2026-04 起新表不再自动暴露给 Data API:显式授权。
-- 只授 authenticated,匿名角色完全不可见。
grant select, insert, update, delete on public.aios_conversations to authenticated;
grant select, insert, update, delete on public.aios_memories to authenticated;

-- 每张表四条策略:select/insert/update/delete 全部限定本人行。
-- update 必须同时带 using + with check,否则行可被改挂到别的 user_id 下。
create policy "select own conversations" on public.aios_conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert own conversations" on public.aios_conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own conversations" on public.aios_conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "delete own conversations" on public.aios_conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "select own memories" on public.aios_memories
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert own memories" on public.aios_memories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own memories" on public.aios_memories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "delete own memories" on public.aios_memories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create index aios_conversations_user_updated
  on public.aios_conversations (user_id, updated_at desc);
