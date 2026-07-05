-- 退休/HSA 账户基金占比（Top Positions 导入）

alter table public.accounts
  add column if not exists fund_allocations jsonb;

comment on column public.accounts.fund_allocations is
  'Fund weights inside retirement/HSA accounts: ticker, weightPct, assetClass.';
