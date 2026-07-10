-- Purchase enrichment apply run ledger (P0 operational traceability)
-- DO NOT APPLY until migration is reviewed and approved via scripts/supabase-sql.sh
-- See apps/finance/docs/merchant-order-audit/IDEMPOTENCY_DESIGN.md

create table if not exists public.finance_purchase_enrichment_apply_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  operator text,
  git_head text,
  mode text not null check (mode in ('dry-run', 'scoped', 'broad')),
  scope jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  approved_by text,
  os_module text not null default 'finance'
);

create table if not exists public.finance_purchase_enrichment_apply_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.finance_purchase_enrichment_apply_runs (id) on delete cascade,
  transaction_id uuid not null,
  action text not null check (action in ('insert', 'update', 'skip', 'error', 'dry-run')),
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists finance_purchase_enrichment_apply_runs_started_idx
  on public.finance_purchase_enrichment_apply_runs (started_at desc);

create index if not exists finance_purchase_enrichment_apply_run_items_run_idx
  on public.finance_purchase_enrichment_apply_run_items (run_id);

alter table public.finance_purchase_enrichment_apply_runs enable row level security;
alter table public.finance_purchase_enrichment_apply_run_items enable row level security;

create policy finance_purchase_enrichment_apply_runs_select_own
  on public.finance_purchase_enrichment_apply_runs for select
  using (auth.uid() = user_id);

create policy finance_purchase_enrichment_apply_run_items_select_own
  on public.finance_purchase_enrichment_apply_run_items for select
  using (
    exists (
      select 1 from public.finance_purchase_enrichment_apply_runs r
      where r.id = run_id and r.user_id = auth.uid()
    )
  );

comment on table public.finance_purchase_enrichment_apply_runs is
  'Audit ledger for CLI purchase_enrichment apply runs (Management API / service role writes).';
