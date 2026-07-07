# Idempotency Design — Purchase Enrichment

> **Status:** Design only — **DO NOT APPLY** partial unique SQL until duplicate cleanup is complete.

## Priority order (P0)

1. Apply run ledger (`finance_purchase_enrichment_apply_runs` / `_items`)
2. Duplicate cleanup policy ([DUPLICATE_CLEANUP_POLICY.md](./DUPLICATE_CLEANUP_POLICY.md))
3. Partial unique index (after cleanup)
4. Storage hardening ([STORAGE_HARDENING.md](./STORAGE_HARDENING.md))

## Partial unique strategy (draft SQL)

```sql
-- DO NOT APPLY YET — design candidate only
-- Requires: Amazon/Best Buy duplicate groups classified + backfill approved

CREATE UNIQUE INDEX finance_txn_purchase_enrichment_uq
  ON finance_transactions (user_id, (purchase_enrichment->>'source'), (purchase_enrichment->>'orderId'))
  WHERE purchase_enrichment IS NOT NULL
    AND purchase_enrichment->>'orderId' IS NOT NULL
    AND purchase_enrichment->>'source' IN ('amazon', 'bestbuy', 'target');
```

### in_store receipt rows

Target/Best Buy receipt IDs may need `mergeKey`-based uniqueness instead of `orderId` alone. See AUDIT §16.2.

## CLI behavior after unique index

- `link-purchase-orders.mjs` should treat constraint violation as **skip + ledger item**, not silent overwrite
- Scoped `--only-transaction-ids` remains default apply mode
- Broad apply requires `approved_by` in apply run ledger

## schemaVersion

New writes set `purchase_enrichment.schemaVersion: 1` via `stripLinkMetadata()`.
Readers treat missing version as legacy (`0`).

## Single source of truth

Classification rules live in `@life-os/finance-enrichment-contract` (`packages/finance-enrichment-contract/src/classify.mjs`).
UI and read model must import from this package — do not fork rules.
