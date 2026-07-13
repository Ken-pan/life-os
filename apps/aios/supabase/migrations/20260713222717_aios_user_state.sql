-- AI.OS · aios schema · 用户设置/画像单例(每用户一行)
-- 设置和用户画像(userProfile,常驻注入的核心身份)是单例状态,不是集合,
-- 建模为一行 jsonb blob + 客户端毫秒时间戳,整包 LWW 合并(对齐 music_user_state)。
-- 向量/草稿/代理会话等本机数据不进这张表。

create table if not exists aios.user_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0
);

alter table aios.user_state enable row level security;

grant select, insert, update, delete on aios.user_state to authenticated;

create policy "user_state_select_own" on aios.user_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_state_insert_own" on aios.user_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_state_update_own" on aios.user_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_state_delete_own" on aios.user_state
  for delete to authenticated
  using ((select auth.uid()) = user_id);
