-- Finance OS —— 后端 schema（normalized）
-- 主数据改为关系表 + RLS（按 user_id 隔离）。

-- 说明：
-- 1) finance_data 为旧 jsonb 备份表，保留不删（仅历史回滚用途）。
-- 2) 当前主读写表：user_settings / accounts / cash_flows / scenario_events / goals / transactions

-- ===== legacy backup: finance_data（保留，不作为主读写路径） =====
create table if not exists public.finance_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.finance_data enable row level security;
drop policy if exists "own finance_data select" on public.finance_data;
create policy "own finance_data select" on public.finance_data for select using ((select auth.uid()) = user_id);
drop policy if exists "own finance_data insert" on public.finance_data;
create policy "own finance_data insert" on public.finance_data for insert with check ((select auth.uid()) = user_id);
drop policy if exists "own finance_data update" on public.finance_data;
create policy "own finance_data update" on public.finance_data for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own finance_data delete" on public.finance_data;
create policy "own finance_data delete" on public.finance_data for delete using ((select auth.uid()) = user_id);

-- ===== normalized tables =====
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  assumptions jsonb not null,
  privacy boolean not null default false,
  locale text not null default 'zh-CN',
  data_version integer not null default 6,
  active_scenario_id text,
  updated_at timestamptz not null default now()
);
alter table public.user_settings add column if not exists active_scenario_id text;
alter table public.user_settings add column if not exists portfolio_allocation_target jsonb;

create table if not exists public.accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  type text not null,
  balance numeric not null default 0,
  annual_return numeric,
  apr numeric,
  liquid boolean,
  credit_mode text,
  statement_balance numeric,
  due_day integer,
  auto_pay_mode text,
  payment_account_id text,
  annual_fee numeric,
  annual_fee_date text,
  monthly_payment numeric,
  term_months integer,
  basis numeric,
  note text,
  balance_manual boolean not null default false,
  fund_allocations jsonb,
  underlying_allocation jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.holdings_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
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
  reconciliation_status text not null default 'incomplete',
  holdings_market_value numeric not null default 0,
  implied_cost_basis numeric,
  unrealized_gain numeric,
  weighted_total_return_pct numeric,
  today_return_amount_approx numeric,
  today_return_pct_approx numeric,
  position_count integer not null default 0,
  stock_count integer,
  etf_count integer,
  primary key (user_id, id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'holdings_snapshots_reconciliation_status_check'
      and conrelid = 'public.holdings_snapshots'::regclass
  ) then
    alter table public.holdings_snapshots
      add constraint holdings_snapshots_reconciliation_status_check
      check (reconciliation_status in ('incomplete', 'complete'));
  end if;
end $$;

create table if not exists public.holding_positions (
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id text not null,
  id text not null,
  ticker text not null,
  security_name text not null,
  asset_type text not null default 'other',
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
    select 1 from pg_constraint
    where conname = 'holding_positions_asset_type_check'
      and conrelid = 'public.holding_positions'::regclass
  ) then
    alter table public.holding_positions
      add constraint holding_positions_asset_type_check
      check (asset_type in ('stock', 'etf', 'other'));
  end if;
end $$;

create table if not exists public.holding_price_trails (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  captured_at timestamptz not null,
  price numeric not null check (price > 0),
  source_type text not null default 'live' check (source_type in ('live', 'snapshot')),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol, captured_at)
);

create table if not exists public.holding_daily_candles (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  date date not null,
  close numeric not null check (close > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol, date)
);

create table if not exists public.cash_flows (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  type text not null,
  frequency text not null,
  amount numeric not null default 0,
  essential boolean,
  start_month integer,
  end_month integer,
  category text,
  pay_frequency text,
  anchor_date text,
  due_day integer,
  primary key (user_id, id)
);

create table if not exists public.scenarios (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default 'Scenario',
  description text,
  scenario_type text not null default 'custom',
  status text not null default 'draft',
  comparison_color_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  primary key (user_id, id)
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenarios_status_check'
      and conrelid = 'public.scenarios'::regclass
  ) then
    alter table public.scenarios
      add constraint scenarios_status_check
      check (status in ('draft', 'saved', 'chosen', 'archived'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenarios_type_check'
      and conrelid = 'public.scenarios'::regclass
  ) then
    alter table public.scenarios
      add constraint scenarios_type_check
      check (
        scenario_type in (
          'custom',
          'purchase',
          'recurring_cost',
          'rent_change',
          'travel',
          'career_break',
          'partner_contribution',
          'cash_vs_finance'
        )
      );
  end if;
end $$;

create table if not exists public.scenario_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  scenario_id text not null default 'scenario_baseline',
  name text not null default '',
  event_type text not null,
  enabled boolean not null default true,
  month_offset integer not null default 0,
  amount numeric,
  date text,
  percent numeric,
  contribution_percent numeric,
  expense_category text,
  funding_source text,
  reconciled boolean,
  primary key (user_id, id)
);
alter table public.scenario_events add column if not exists scenario_id text;
update public.scenario_events set scenario_id = 'scenario_baseline' where scenario_id is null;
alter table public.scenario_events alter column scenario_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenario_events_type_check'
      and conrelid = 'public.scenario_events'::regclass
  ) then
    alter table public.scenario_events
      add constraint scenario_events_type_check
      check (
        event_type in (
          'one_time_expense',
          'recurring_expense_change',
          'income_change',
          'transfer',
          'goal_allocation_change',
          'partner_contribution',
          'financed_purchase',
          'custom',
          'salary-change',
          'expense-change',
          'one-time-purchase',
          'windfall'
        )
      );
  end if;
end $$;

create table if not exists public.scenario_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id text not null,
  snapshot_type text not null,
  assumptions_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.decision_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  scenario_id text not null,
  decision_status text not null,
  decision_summary text not null default '',
  reason text,
  expected_outcome_json jsonb,
  actual_outcome_json jsonb,
  decided_at timestamptz,
  review_on date,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'decision_records_status_check'
      and conrelid = 'public.decision_records'::regclass
  ) then
    alter table public.decision_records
      add constraint decision_records_status_check
      check (decision_status in ('considering', 'chosen', 'declined', 'deferred', 'reviewed'));
  end if;
end $$;

create table if not exists public.scenario_apply_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_scenario_id text not null,
  selected_event_ids jsonb not null default '[]'::jsonb,
  inserted_event_ids jsonb not null default '[]'::jsonb,
  applied_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists scenarios_user_idx on public.scenarios (user_id, status, updated_at desc);
create index if not exists scenario_events_user_scenario_idx on public.scenario_events (user_id, scenario_id);
create index if not exists scenario_snapshots_user_scenario_idx on public.scenario_snapshots (user_id, scenario_id, created_at desc);
create index if not exists decision_records_user_scenario_idx on public.decision_records (user_id, scenario_id, created_at desc);
create index if not exists scenario_apply_audits_user_idx on public.scenario_apply_audits (user_id, applied_at desc);
create index if not exists holdings_snapshots_user_asof_idx on public.holdings_snapshots (user_id, as_of_date desc, imported_at desc);
create index if not exists holding_positions_user_snapshot_idx on public.holding_positions (user_id, snapshot_id, market_value desc);
create index if not exists holding_price_trails_user_symbol_idx on public.holding_price_trails (user_id, symbol, captured_at desc);
create index if not exists holding_daily_candles_user_symbol_date_idx on public.holding_daily_candles (user_id, symbol, date desc);

insert into public.scenarios (user_id, id, name, scenario_type, status)
select distinct se.user_id, 'scenario_baseline', 'Baseline', 'custom', 'saved'
from public.scenario_events se
where not exists (
  select 1 from public.scenarios s
  where s.user_id = se.user_id and s.id = 'scenario_baseline'
);

update public.scenario_events
set scenario_id = 'scenario_baseline'
where scenario_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenario_events_user_scenario_fk'
      and conrelid = 'public.scenario_events'::regclass
  ) then
    alter table public.scenario_events
      add constraint scenario_events_user_scenario_fk
      foreign key (user_id, scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenario_apply_audits_source_fk'
      and conrelid = 'public.scenario_apply_audits'::regclass
  ) then
    alter table public.scenario_apply_audits
      add constraint scenario_apply_audits_source_fk
      foreign key (user_id, source_scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenario_snapshots_user_scenario_fk'
      and conrelid = 'public.scenario_snapshots'::regclass
  ) then
    alter table public.scenario_snapshots
      add constraint scenario_snapshots_user_scenario_fk
      foreign key (user_id, scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'decision_records_user_scenario_fk'
      and conrelid = 'public.decision_records'::regclass
  ) then
    alter table public.decision_records
      add constraint decision_records_user_scenario_fk
      foreign key (user_id, scenario_id)
      references public.scenarios (user_id, id)
      on delete cascade;
  end if;
end $$;

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

create table if not exists public.goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  metric text not null,
  target numeric not null default 0,
  current numeric,
  priority text,
  funding_account_id text,
  monthly_allocation numeric,
  monthly_allocation_day integer,
  target_date text,
  reserve_policy text,
  reserve boolean,
  primary key (user_id, id)
);

alter table public.goals add column if not exists monthly_allocation_day integer;
alter table public.goals add column if not exists reserve_policy text;
alter table public.user_settings alter column data_version set default 6;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  txn_date date not null,
  merchant text not null default '',
  category text not null default 'Uncategorized',
  account text not null default 'Unknown',
  flow text not null default 'expense',
  amount numeric not null default 0,
  budget_impact numeric not null default 0,
  in_spending boolean not null default false,
  in_cash_flow boolean not null default false,
  exclude_reason text,
  source text not null default 'import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category);
create index if not exists transactions_user_flow_idx on public.transactions (user_id, flow);

do $$
declare t text;
begin
  foreach t in array array['user_settings','accounts','holdings_snapshots','holding_positions','holding_price_trails','holding_daily_candles','cash_flows','scenarios','scenario_events','goals','transactions','scenario_snapshots','decision_records','scenario_apply_audits']
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

create or replace function public.apply_scenario_to_plan_v1(payload jsonb)
returns table (
  applied_count integer,
  inserted_event_ids jsonb,
  applied_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  src_scenario text;
  selected_ids text[];
  inserted_ids jsonb := '[]'::jsonb;
  rows_applied integer := 0;
  audit_applied_at timestamptz := now();
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  src_scenario := nullif(payload ->> 'scenario_id', '');
  if src_scenario is null then
    raise exception 'scenario_id required';
  end if;
  if src_scenario = 'scenario_baseline' then
    raise exception 'baseline scenario cannot be applied to itself';
  end if;
  if not exists (
    select 1
    from public.scenarios s
    where s.user_id = uid
      and s.id = src_scenario
  ) then
    raise exception 'scenario not found';
  end if;
  if jsonb_typeof(payload -> 'selected_event_ids') <> 'array' then
    raise exception 'selected_event_ids must be an array';
  end if;
  select coalesce(array_agg(v), '{}') into selected_ids
  from jsonb_array_elements_text(payload -> 'selected_event_ids') as t(v);
  if cardinality(selected_ids) = 0 then
    raise exception 'at least one selected event required';
  end if;

  with source_events as (
    select e.*
    from public.scenario_events e
    where e.user_id = uid
      and e.scenario_id = src_scenario
      and e.id = any(selected_ids)
  ),
  inserted as (
    insert into public.scenario_events (
      user_id,
      id,
      scenario_id,
      name,
      event_type,
      enabled,
      month_offset,
      amount,
      date,
      percent,
      contribution_percent,
      expense_category,
      funding_source,
      reconciled
    )
    select
      uid,
      'evt_apply_' || replace(substr(gen_random_uuid()::text, 1, 8), '-', ''),
      'scenario_baseline',
      se.name,
      se.event_type,
      se.enabled,
      se.month_offset,
      se.amount,
      se.date,
      se.percent,
      se.contribution_percent,
      se.expense_category,
      se.funding_source,
      se.reconciled
    from source_events se
    returning id
  )
  select count(*)::integer, coalesce(jsonb_agg(id), '[]'::jsonb)
  into rows_applied, inserted_ids
  from inserted;

  if rows_applied = 0 then
    raise exception 'no events were applied';
  end if;

  insert into public.scenario_apply_audits (
    user_id,
    source_scenario_id,
    selected_event_ids,
    inserted_event_ids,
    applied_at
  ) values (
    uid,
    src_scenario,
    to_jsonb(selected_ids),
    inserted_ids,
    audit_applied_at
  );

  return query select rows_applied, inserted_ids, audit_applied_at;
end;
$$;

create or replace function public.undo_latest_scenario_apply_v1()
returns table (
  undone_count integer,
  undone_event_ids jsonb,
  undone_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  audit_id uuid;
  inserted_ids jsonb;
  ts timestamptz := now();
  rows_deleted integer := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;
  select a.id, a.inserted_event_ids
  into audit_id, inserted_ids
  from public.scenario_apply_audits a
  where a.user_id = uid
    and a.undone_at is null
  order by a.applied_at desc
  limit 1;
  if audit_id is null then
    raise exception 'no apply operation available to undo';
  end if;
  delete from public.scenario_events e
  where e.user_id = uid
    and e.scenario_id = 'scenario_baseline'
    and e.id in (select value::text from jsonb_array_elements_text(inserted_ids));
  get diagnostics rows_deleted = row_count;
  update public.scenario_apply_audits
  set undone_at = ts
  where id = audit_id;
  return query select rows_deleted, inserted_ids, ts;
end;
$$;

revoke execute on function public.apply_scenario_to_plan_v1(jsonb) from public;
revoke execute on function public.apply_scenario_to_plan_v1(jsonb) from anon;
grant execute on function public.apply_scenario_to_plan_v1(jsonb) to authenticated;
revoke execute on function public.undo_latest_scenario_apply_v1() from public;
revoke execute on function public.undo_latest_scenario_apply_v1() from anon;
grant execute on function public.undo_latest_scenario_apply_v1() to authenticated;

-- ===== 已授权设备：按逻辑槽位（desktop / mobile），非按浏览器 =====
create table if not exists public.allowed_devices (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_class text not null check (device_class in ('desktop', 'mobile')),
  label text not null default '设备',
  user_agent text,
  -- 浏览器端持久化设备指纹（localStorage 中长期不变），用于真正识别同一台设备。
  device_id text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (user_id, device_class)
);

create index if not exists allowed_devices_user_idx
  on public.allowed_devices (user_id);

create index if not exists allowed_devices_device_id_idx
  on public.allowed_devices (user_id, device_id);

alter table public.allowed_devices enable row level security;

drop policy if exists "own devices select" on public.allowed_devices;
create policy "own devices select" on public.allowed_devices
  for select using ((select auth.uid()) = user_id);

drop policy if exists "own devices insert" on public.allowed_devices;
create policy "own devices insert" on public.allowed_devices
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "own devices update" on public.allowed_devices;
create policy "own devices update" on public.allowed_devices
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own devices delete" on public.allowed_devices;
create policy "own devices delete" on public.allowed_devices
  for delete using ((select auth.uid()) = user_id);

-- ===== 服务端强制：每个用户最多 2 台设备（客户端无法绕过）=====
create or replace function public.enforce_device_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  slot_count integer;
begin
  select count(distinct device_class) into slot_count
  from public.allowed_devices
  where user_id = new.user_id;

  if slot_count >= 2 and not exists (
    select 1 from public.allowed_devices
    where user_id = new.user_id and device_class = new.device_class
  ) then
    raise exception 'device limit reached (max 1 desktop + 1 mobile)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_device_limit on public.allowed_devices;
create trigger trg_enforce_device_limit
  before insert on public.allowed_devices
  for each row execute function public.enforce_device_limit();

revoke execute on function public.enforce_device_limit() from public;
revoke execute on function public.enforce_device_limit() from anon;
revoke execute on function public.enforce_device_limit() from authenticated;

-- ===== I-P0: Life OS shared identity (core_profiles + core_user_app_settings) =====
create table if not exists public.core_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'America/Los_Angeles',
  locale text not null default 'en',
  default_app text check (default_app is null or default_app in ('finance', 'fitness', 'planner', 'music', 'portal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.core_profiles is 'Life OS 共享用户档案；id = auth.users.id';
comment on column public.core_profiles.default_app is 'Portal / 启动器默认打开的 App';

alter table public.core_profiles enable row level security;

drop policy if exists "core_profiles_select_own" on public.core_profiles;
create policy "core_profiles_select_own"
  on public.core_profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "core_profiles_insert_own" on public.core_profiles;
create policy "core_profiles_insert_own"
  on public.core_profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "core_profiles_update_own" on public.core_profiles;
create policy "core_profiles_update_own"
  on public.core_profiles for update
  using ((select auth.uid()) = id);

drop trigger if exists core_profiles_updated_at on public.core_profiles;
create trigger core_profiles_updated_at
  before update on public.core_profiles
  for each row execute function private.set_updated_at();

create table if not exists public.core_user_app_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id text not null check (app_id in ('finance', 'fitness', 'planner', 'music', 'portal')),
  settings jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

comment on table public.core_user_app_settings is 'Life OS 各 App 用户设置（jsonb）与 last_opened_at';

alter table public.core_user_app_settings enable row level security;

drop policy if exists "core_user_app_settings_select_own" on public.core_user_app_settings;
create policy "core_user_app_settings_select_own"
  on public.core_user_app_settings for select
  using ((select auth.uid()) = user_id);

drop policy if exists "core_user_app_settings_insert_own" on public.core_user_app_settings;
create policy "core_user_app_settings_insert_own"
  on public.core_user_app_settings for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "core_user_app_settings_update_own" on public.core_user_app_settings;
create policy "core_user_app_settings_update_own"
  on public.core_user_app_settings for update
  using ((select auth.uid()) = user_id);

drop trigger if exists core_user_app_settings_updated_at on public.core_user_app_settings;
create trigger core_user_app_settings_updated_at
  before update on public.core_user_app_settings
  for each row execute function private.set_updated_at();

create or replace function private.core_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_app text;
begin
  v_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.core_profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  foreach v_app in array array['finance', 'fitness', 'planner', 'music', 'portal']
  loop
    insert into public.core_user_app_settings (user_id, app_id)
    values (new.id, v_app)
    on conflict (user_id, app_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists core_on_auth_user_created on auth.users;
create trigger core_on_auth_user_created
  after insert on auth.users
  for each row execute function private.core_handle_new_user();

alter table public.core_profiles
  add column if not exists os_module text not null default 'core';
alter table public.core_profiles drop constraint if exists core_profiles_os_module_check;
alter table public.core_profiles
  add constraint core_profiles_os_module_check check (os_module = 'core');

alter table public.core_user_app_settings
  add column if not exists os_module text not null default 'core';
alter table public.core_user_app_settings drop constraint if exists core_user_app_settings_os_module_check;
alter table public.core_user_app_settings
  add constraint core_user_app_settings_os_module_check check (os_module = 'core');

-- ===== I-P1.5 Events Layer: life_events table & transactional outbox =====
create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists life_events_user_status_idx on public.life_events(user_id, status);
create index if not exists life_events_type_idx on public.life_events(type);

alter table public.life_events enable row level security;
drop policy if exists life_events_select on public.life_events;
create policy life_events_select on public.life_events for select using (auth.uid() = user_id);
drop policy if exists life_events_insert on public.life_events;
create policy life_events_insert on public.life_events for insert with check (auth.uid() = user_id);
drop policy if exists life_events_update on public.life_events;
create policy life_events_update on public.life_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists life_events_delete on public.life_events;
create policy life_events_delete on public.life_events for delete using (auth.uid() = user_id);

create or replace function public.trg_finance_bill_to_event()
returns trigger as $$
begin
  if NEW.source_type = 'card_bill' then
    insert into public.life_events (
      user_id,
      type,
      payload
    ) values (
      NEW.user_id,
      'finance.bill_due',
      jsonb_build_object(
        'occurrence_id', NEW.id,
        'label', NEW.label,
        'expected_amount', NEW.expected_amount,
        'occurrence_date', NEW.occurrence_date
      )
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists finance_bill_event_trigger on public.finance_expected_occurrences;
create trigger finance_bill_event_trigger
  after insert on public.finance_expected_occurrences
  for each row
  execute function public.trg_finance_bill_to_event();
