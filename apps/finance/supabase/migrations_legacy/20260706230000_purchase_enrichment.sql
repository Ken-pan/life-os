-- Link external purchase context (e.g. Amazon order line items) to finance transactions.

alter table public.finance_transactions
  add column if not exists purchase_enrichment jsonb;

comment on column public.finance_transactions.purchase_enrichment is
  'Optional purchase context: { source, orderId, detailUrl, lineItems[], matchConfidence, matchedAt }';

create index if not exists finance_transactions_purchase_enrichment_idx
  on public.finance_transactions (user_id)
  where purchase_enrichment is not null;
