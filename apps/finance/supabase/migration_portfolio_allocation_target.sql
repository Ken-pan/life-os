-- 资产配置目标（个股/ETF 比例、集中度上限、偏离阈值）存入 user_settings，按用户同步。

alter table public.user_settings
  add column if not exists portfolio_allocation_target jsonb;

comment on column public.user_settings.portfolio_allocation_target is
  'Portfolio allocation hub: stock/etf targets, concentration caps, drift threshold (JSON).';
