-- Finance OS P1B P1 — Expected occurrences (timeline state machine)

begin;

create table if not exists public.expected_occurrences (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('cashflow', 'event', 'card_bill', 'goal_transfer', 'annual_fee')),
  source_id text not null,
  label text not null,
  occurrence_date date not null,
  expected_amount numeric not null,
  account_id text,
  state text not null check (state in ('planned', 'upcoming', 'pending', 'matched', 'reconciled', 'skipped')),
  matched_txn_id uuid references public.transactions(id) on delete set null,
  actual_amount numeric,
  actual_date date,
  reconciled_period_id uuid references public.balance_assertions(id) on delete set null,
  variance_amount numeric,
  variance_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists expected_occurrences_user_source_date_uidx
  on public.expected_occurrences(user_id, source_type, source_id, occurrence_date);

create index if not exists expected_occurrences_user_state_date_idx
  on public.expected_occurrences(user_id, state, occurrence_date);

do $$
declare t text;
begin
  t := 'expected_occurrences';
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t || '_delete', t);
end $$;

commit;
