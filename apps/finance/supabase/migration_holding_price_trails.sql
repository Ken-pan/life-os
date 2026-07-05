begin;

create table if not exists public.holding_price_trails (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  captured_at timestamptz not null,
  price numeric not null check (price > 0),
  source_type text not null default 'live' check (source_type in ('live', 'snapshot')),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol, captured_at)
);

create index if not exists holding_price_trails_user_symbol_idx
  on public.holding_price_trails (user_id, symbol, captured_at desc);

alter table public.holding_price_trails enable row level security;

drop policy if exists holding_price_trails_select on public.holding_price_trails;
create policy holding_price_trails_select
  on public.holding_price_trails
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists holding_price_trails_insert on public.holding_price_trails;
create policy holding_price_trails_insert
  on public.holding_price_trails
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists holding_price_trails_update on public.holding_price_trails;
create policy holding_price_trails_update
  on public.holding_price_trails
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists holding_price_trails_delete on public.holding_price_trails;
create policy holding_price_trails_delete
  on public.holding_price_trails
  for delete
  using ((select auth.uid()) = user_id);

commit;
