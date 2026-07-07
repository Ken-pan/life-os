-- Unlinked merchant orders (e.g. Target RedCard) for Finance OS catalog UI.
alter table public.finance_user_settings
  add column if not exists merchant_order_catalog jsonb;

comment on column public.finance_user_settings.merchant_order_catalog is
  'Orders harvested from merchant sites that could not auto-match bank txns (JSON: { updatedAt, sources: { target?: { orders }, bestbuy?: { orders } } }).';
