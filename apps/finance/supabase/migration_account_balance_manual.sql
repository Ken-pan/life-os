-- 标记用户手动维护的账户余额，启动校准时不再被持仓快照覆盖。

alter table public.accounts
  add column if not exists balance_manual boolean not null default false;

comment on column public.accounts.balance_manual is
  'When true, finance setup skips auto balance/basis sync from holdings snapshots.';
