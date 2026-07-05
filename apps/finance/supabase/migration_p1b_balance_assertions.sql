-- Finance OS P1B P0 — Balance assertions & reconcile_adjustment flow type
-- L2 reconciliation anchor: explicit dated balance checks for cash accounts.

begin;

create table if not exists public.balance_assertions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  assertion_date date not null,
  amount numeric not null,
  note text,
  adjustment_txn_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists balance_assertions_user_account_date_idx
  on public.balance_assertions(user_id, account_id, assertion_date desc);

alter table public.transactions drop constraint if exists transactions_flow_type_check;

alter table public.transactions
  add constraint transactions_flow_type_check
  check (flow_type in (
    'expense',
    'income',
    'refund_or_reversal',
    'internal_transfer',
    'credit_card_payment',
    'ignored',
    'zero_activity',
    'unknown',
    'reconcile_adjustment'
  ));

do $$
declare t text;
begin
  t := 'balance_assertions';
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
