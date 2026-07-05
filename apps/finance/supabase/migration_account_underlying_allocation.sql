-- Fidelity Asset allocation look-through (Domestic/Foreign Stock, Bonds, etc.)

alter table public.accounts
  add column if not exists underlying_allocation jsonb;

comment on column public.accounts.underlying_allocation is
  'Look-through asset class weights for retirement/HSA (e.g. OGSV MW 2065 breakdown).';
