begin;

create table if not exists public.holding_daily_candles (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  date date not null,
  close numeric not null check (close > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol, date)
);

create index if not exists holding_daily_candles_user_symbol_date_idx
  on public.holding_daily_candles (user_id, symbol, date desc);

alter table public.holding_daily_candles enable row level security;

drop policy if exists holding_daily_candles_select on public.holding_daily_candles;
create policy holding_daily_candles_select
  on public.holding_daily_candles
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists holding_daily_candles_insert on public.holding_daily_candles;
create policy holding_daily_candles_insert
  on public.holding_daily_candles
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists holding_daily_candles_update on public.holding_daily_candles;
create policy holding_daily_candles_update
  on public.holding_daily_candles
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists holding_daily_candles_delete on public.holding_daily_candles;
create policy holding_daily_candles_delete
  on public.holding_daily_candles
  for delete
  using ((select auth.uid()) = user_id);

commit;
