-- Finance OS Holdings Snapshot module (read-only portfolio context)
-- Stores point-in-time holdings snapshots without changing account balances.

begin;

create table if not exists public.holdings_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  account_id text,
  institution text,
  account_label text not null,
  as_of_date date not null,
  as_of_time_local text,
  timezone text,
  imported_at timestamptz not null default now(),
  source_type text not null default 'manual_snapshot_import',
  source_description text,
  note text,
  needs_user_confirmation boolean not null default false,
  reconciliation_status text not null default 'incomplete' check (reconciliation_status in ('incomplete', 'complete')),
  holdings_market_value numeric not null default 0,
  implied_cost_basis numeric,
  unrealized_gain numeric,
  weighted_total_return_pct numeric,
  today_return_amount_approx numeric,
  today_return_pct_approx numeric,
  position_count integer not null default 0 check (position_count >= 0),
  stock_count integer,
  etf_count integer,
  primary key (user_id, id)
);

create index if not exists holdings_snapshots_user_asof_idx
  on public.holdings_snapshots (user_id, as_of_date desc, imported_at desc);

create table if not exists public.holding_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_id text not null,
  id text not null,
  ticker text not null,
  security_name text not null,
  asset_type text not null default 'other' check (asset_type in ('stock', 'etf', 'other')),
  shares numeric not null default 0,
  market_price numeric not null default 0,
  market_value numeric not null default 0,
  average_cost_per_share numeric,
  implied_cost_basis numeric,
  portfolio_weight_pct numeric,
  portfolio_diversity_displayed_pct numeric,
  today_return_amount numeric,
  today_return_pct numeric,
  total_return_amount numeric,
  total_return_pct_displayed numeric,
  source_captured_at text,
  primary key (user_id, snapshot_id, id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'holding_positions_snapshot_fk'
      and conrelid = 'public.holding_positions'::regclass
  ) then
    alter table public.holding_positions
      add constraint holding_positions_snapshot_fk
      foreign key (user_id, snapshot_id)
      references public.holdings_snapshots (user_id, id)
      on delete cascade;
  end if;
end $$;

create index if not exists holding_positions_user_snapshot_idx
  on public.holding_positions (user_id, snapshot_id, market_value desc);

do $$
declare t text;
begin
  foreach t in array array['holdings_snapshots', 'holding_positions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t || '_delete', t);
  end loop;
end $$;

commit;
