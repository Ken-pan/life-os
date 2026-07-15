-- HomeOS · 事件流上云(能力17)。
-- 本地 IndexedDB(homeos_events)是第一落点;这张表是**追加式镜像**:
-- 跨设备汇流 + 浏览器数据被清后历史不丢。事件只增不改不删 ——
-- 没有 updated_at、没有墓碑,同 (user_id, id) 重推 on conflict do nothing,
-- 幂等续传不需要 LWW。
-- 契约(网页端 apps/home/src/lib/spatial/event-derive.js 同源):
--   id 'ev-{ts}-{seq}' · ts 客户端毫秒 · type 白名单见 EVENT_TYPES
--   subject {placementId|itemId|zoneId|zoneCode|signature} · data 事件详情 · v=1

create table if not exists home.events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  ts bigint not null,
  type text not null,
  subject jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  v int not null default 1,
  primary key (user_id, id)
);

alter table home.events enable row level security;

-- 只本人可见;append-only:不给 update/delete 策略(没有策略 = 拒绝),
-- 历史修不了也删不了 —— 这正是事件流的语义。
create policy "events_select_own" on home.events
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "events_insert_own" on home.events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create index if not exists events_user_ts
  on home.events (user_id, ts desc);
