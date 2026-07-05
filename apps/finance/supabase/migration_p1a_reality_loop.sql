-- Finance OS P1A — Reality Loop minimal trusted path
-- CSV local review -> explicit confirmation -> atomic persistence.

begin;

create table if not exists public.transaction_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'failed', 'superseded')),
  source_type text not null default 'csv',
  source_file_name_masked text not null,
  source_file_hash text not null,
  raw_row_count integer not null default 0 check (raw_row_count >= 0),
  accepted_row_count integer not null default 0 check (accepted_row_count >= 0),
  excluded_row_count integer not null default 0 check (excluded_row_count >= 0),
  review_row_count integer not null default 0 check (review_row_count >= 0),
  date_min date,
  date_max date,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists transaction_imports_user_idx on public.transaction_imports(user_id, created_at desc);
create unique index if not exists transaction_imports_user_file_hash_finalized_uidx
  on public.transaction_imports(user_id, source_file_hash)
  where status = 'finalized';

alter table public.transactions
  add column if not exists import_id uuid references public.transaction_imports(id) on delete set null,
  add column if not exists transaction_fingerprint text,
  add column if not exists occurred_on date,
  add column if not exists original_date date,
  add column if not exists source_account_label text,
  add column if not exists source_account_masked text,
  add column if not exists institution text,
  add column if not exists account_type text,
  add column if not exists merchant_name text,
  add column if not exists description text,
  add column if not exists source_category text,
  add column if not exists normalized_category text,
  add column if not exists source_amount numeric,
  add column if not exists net_worth_impact numeric,
  add column if not exists account_balance_impact numeric,
  add column if not exists flow_type text,
  add column if not exists include_in_spending_analytics boolean,
  add column if not exists include_in_cash_flow_history boolean,
  add column if not exists review_status text,
  add column if not exists review_flags jsonb;

update public.transactions
set
  occurred_on = coalesce(occurred_on, txn_date),
  merchant_name = coalesce(merchant_name, merchant),
  normalized_category = coalesce(normalized_category, category),
  source_account_label = coalesce(source_account_label, account),
  source_amount = coalesce(source_amount, amount),
  flow_type = coalesce(flow_type, flow),
  include_in_spending_analytics = coalesce(include_in_spending_analytics, in_spending),
  include_in_cash_flow_history = coalesce(include_in_cash_flow_history, in_cash_flow),
  review_status = coalesce(review_status, 'resolved'),
  review_flags = coalesce(review_flags, '[]'::jsonb)
where
  occurred_on is null
  or merchant_name is null
  or normalized_category is null
  or source_account_label is null
  or source_amount is null
  or flow_type is null
  or include_in_spending_analytics is null
  or include_in_cash_flow_history is null
  or review_status is null
  or review_flags is null;

alter table public.transactions
  alter column occurred_on set not null,
  alter column merchant_name set not null,
  alter column normalized_category set not null,
  alter column source_amount set not null,
  alter column flow_type set not null,
  alter column include_in_spending_analytics set not null,
  alter column include_in_cash_flow_history set not null,
  alter column review_status set not null,
  alter column review_flags set default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_flow_type_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_flow_type_check
      check (flow_type in ('expense', 'income', 'refund_or_reversal', 'internal_transfer', 'credit_card_payment', 'ignored', 'zero_activity', 'unknown'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_review_status_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_review_status_check
      check (review_status in ('open', 'resolved', 'ignored'));
  end if;
end $$;

create index if not exists transactions_user_import_idx on public.transactions(user_id, import_id);
create index if not exists transactions_user_fingerprint_idx on public.transactions(user_id, transaction_fingerprint);
create index if not exists transactions_user_spending_analytics_idx on public.transactions(user_id, include_in_spending_analytics, occurred_on desc);

create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_type text not null check (match_type in ('exact', 'contains', 'prefix', 'regex')),
  match_value text not null,
  normalized_category text,
  flow_type_override text check (flow_type_override in ('expense', 'income', 'refund_or_reversal', 'internal_transfer', 'credit_card_payment', 'ignored', 'zero_activity', 'unknown')),
  include_in_spending_analytics_override boolean,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_rules_user_idx on public.merchant_rules(user_id, updated_at desc);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null references public.transaction_imports(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  review_type text not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  reason text not null,
  suggested_action text not null,
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists review_items_user_idx on public.review_items(user_id, status, created_at desc);
create index if not exists review_items_import_idx on public.review_items(import_id);

create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_rule_id uuid references public.merchant_rules(id) on delete set null,
  merchant_label text not null,
  normalized_category text not null,
  expected_amount numeric not null default 0,
  amount_tolerance numeric not null default 0.2,
  cadence text not null default 'monthly',
  expected_billing_day integer,
  status text not null default 'candidate' check (status in ('candidate', 'confirmed', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_items_user_idx on public.recurring_items(user_id, status, updated_at desc);

do $$
declare t text;
begin
  foreach t in array array['transaction_imports', 'merchant_rules', 'review_items', 'recurring_items']
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

create or replace function public.finalize_transaction_import_v1(payload jsonb)
returns table (
  import_id uuid,
  status text,
  accepted_row_count integer,
  excluded_row_count integer,
  review_row_count integer,
  date_min date,
  date_max date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  import_row_id uuid;
  accepted_count integer := 0;
  excluded_count integer := 0;
  review_count integer := 0;
  min_date date;
  max_date date;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'authentication required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload';
  end if;
  if jsonb_typeof(payload -> 'acceptedRows') <> 'array' then
    raise exception 'invalid acceptedRows';
  end if;

  if exists (
    select 1
    from public.transaction_imports ti
    where ti.user_id = uid
      and ti.status = 'finalized'
      and ti.source_file_hash = coalesce(payload ->> 'sourceFileHash', '')
  ) then
    raise exception 'same-file reimport blocked';
  end if;

  insert into public.transaction_imports (
    user_id,
    status,
    source_type,
    source_file_name_masked,
    source_file_hash,
    raw_row_count,
    schema_version
  )
  values (
    uid,
    'draft',
    'csv',
    left(coalesce(payload ->> 'sourceFileNameMasked', 'csv'), 200),
    left(coalesce(payload ->> 'sourceFileHash', ''), 128),
    greatest(coalesce((payload ->> 'rawRowCount')::integer, 0), 0),
    greatest(coalesce((payload ->> 'schemaVersion')::integer, 1), 1)
  )
  returning id into import_row_id;

  insert into public.transactions (
    user_id,
    import_id,
    transaction_fingerprint,
    occurred_on,
    original_date,
    source_account_label,
    source_account_masked,
    institution,
    account_type,
    merchant_name,
    description,
    source_category,
    normalized_category,
    source_amount,
    amount,
    budget_impact,
    net_worth_impact,
    account_balance_impact,
    flow_type,
    flow,
    include_in_spending_analytics,
    in_spending,
    include_in_cash_flow_history,
    in_cash_flow,
    review_status,
    review_flags,
    txn_date,
    merchant,
    category,
    account,
    source
  )
  select
    uid,
    import_row_id,
    left(coalesce(x.transaction_fingerprint, ''), 200),
    x.occurred_on,
    x.original_date,
    nullif(left(coalesce(x.source_account_label, ''), 200), ''),
    nullif(left(coalesce(x.source_account_masked, ''), 64), ''),
    nullif(left(coalesce(x.institution, ''), 200), ''),
    nullif(left(coalesce(x.account_type, ''), 80), ''),
    left(coalesce(x.merchant_name, ''), 200),
    left(coalesce(x.description, ''), 500),
    nullif(left(coalesce(x.source_category, ''), 200), ''),
    left(coalesce(x.normalized_category, 'Uncategorized'), 200),
    x.source_amount,
    x.source_amount,
    x.budget_impact,
    x.net_worth_impact,
    x.account_balance_impact,
    left(coalesce(x.flow_type, 'unknown'), 40),
    left(coalesce(x.flow_type, 'unknown'), 40),
    coalesce(x.include_in_spending_analytics, false),
    coalesce(x.include_in_spending_analytics, false),
    coalesce(x.include_in_cash_flow_history, true),
    coalesce(x.include_in_cash_flow_history, true),
    left(coalesce(x.review_status, 'open'), 20),
    coalesce(x.review_flags, '[]'::jsonb),
    x.occurred_on,
    left(coalesce(x.merchant_name, ''), 200),
    left(coalesce(x.normalized_category, 'Uncategorized'), 200),
    left(coalesce(x.source_account_label, 'Imported account'), 200),
    'import'
  from jsonb_to_recordset(payload -> 'acceptedRows') as x(
    occurred_on date,
    original_date date,
    source_account_label text,
    source_account_masked text,
    institution text,
    account_type text,
    merchant_name text,
    description text,
    source_category text,
    normalized_category text,
    source_amount numeric,
    budget_impact numeric,
    net_worth_impact numeric,
    account_balance_impact numeric,
    flow_type text,
    include_in_spending_analytics boolean,
    include_in_cash_flow_history boolean,
    review_status text,
    review_flags jsonb,
    transaction_fingerprint text
  )
  where x.occurred_on is not null
    and x.source_amount is not null
    and x.description is not null;

  get diagnostics accepted_count = row_count;

  if jsonb_typeof(payload -> 'reviewItems') = 'array' then
    insert into public.review_items (
      user_id,
      import_id,
      transaction_id,
      review_type,
      severity,
      status,
      reason,
      suggested_action
    )
    select
      uid,
      import_row_id,
      t.id,
      left(coalesce(r.review_type, ''), 80),
      case when r.severity in ('high', 'medium', 'low') then r.severity else 'low' end,
      case when r.status in ('open', 'resolved', 'ignored') then r.status else 'open' end,
      left(coalesce(r.reason, ''), 500),
      left(coalesce(r.suggested_action, ''), 500)
    from jsonb_to_recordset(payload -> 'reviewItems') as r(
      transaction_fingerprint text,
      review_type text,
      severity text,
      status text,
      reason text,
      suggested_action text
    )
    left join public.transactions t
      on t.user_id = uid
      and t.import_id = import_row_id
      and t.transaction_fingerprint = r.transaction_fingerprint;
    get diagnostics review_count = row_count;
  end if;

  if jsonb_typeof(payload -> 'merchantRules') = 'array' then
    insert into public.merchant_rules (
      user_id,
      match_type,
      match_value,
      normalized_category,
      flow_type_override,
      include_in_spending_analytics_override
    )
    select
      uid,
      case when m.match_type in ('exact', 'contains', 'prefix', 'regex') then m.match_type else 'exact' end,
      left(coalesce(m.match_value, ''), 200),
      nullif(left(coalesce(m.normalized_category, ''), 200), ''),
      case
        when m.flow_type_override in ('expense', 'income', 'refund_or_reversal', 'internal_transfer', 'credit_card_payment', 'ignored', 'zero_activity', 'unknown')
        then m.flow_type_override
        else null
      end,
      m.include_in_spending_analytics_override
    from jsonb_to_recordset(payload -> 'merchantRules') as m(
      match_type text,
      match_value text,
      normalized_category text,
      flow_type_override text,
      include_in_spending_analytics_override boolean
    )
    where nullif(coalesce(m.match_value, ''), '') is not null;
  end if;

  select min(t.occurred_on), max(t.occurred_on) into min_date, max_date
  from public.transactions t
  where t.user_id = uid and t.import_id = import_row_id;

  select count(*) into excluded_count
  from public.transactions t
  where t.user_id = uid
    and t.import_id = import_row_id
    and t.include_in_spending_analytics = false;

  update public.transaction_imports
  set
    status = 'finalized',
    accepted_row_count = accepted_count,
    excluded_row_count = excluded_count,
    review_row_count = review_count,
    date_min = min_date,
    date_max = max_date,
    finalized_at = now()
  where id = import_row_id;

  return query
  select
    import_row_id,
    'finalized'::text,
    accepted_count,
    excluded_count,
    review_count,
    min_date,
    max_date;
end;
$$;

revoke execute on function public.finalize_transaction_import_v1(jsonb) from public;
revoke execute on function public.finalize_transaction_import_v1(jsonb) from anon;
grant execute on function public.finalize_transaction_import_v1(jsonb) to authenticated;

commit;
