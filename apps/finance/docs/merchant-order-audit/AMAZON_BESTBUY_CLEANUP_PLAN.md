# Amazon / Best Buy Cleanup Plan (Phase 4)

> **Gate:** P0 checklist complete (ledger applied, duplicate policy executed, no broad apply).  
> **This document is planning only — no apply in this phase without explicit approval.**

## Scope

| Source | Review rows | Target clean (v1.1) | Goal (v1.2 / v1.3) |
|--------|------------:|--------------------:|---------------------|
| Amazon | 121 | 20 | +high-confidence subset after duplicate/return repair |
| Best Buy | 46 | 4 | +in-store harvest + duplicate cleanup |

## Amazon v1.2 batches (proposed)

1. **Duplicate groups** — resolve per [DUPLICATE_CLEANUP_POLICY.md](./DUPLICATE_CLEANUP_POLICY.md)
2. **Stale returnInfo repair** — scoped `--updates-only --clear-stale-return-info-only`
3. **High-confidence inserts** — `--only-transaction-ids` from dry-run report (max 10–20 per batch)
4. Rebuild bundle → `read_model_manifest_v1_2.json`

## Best Buy v1.3 batches (proposed)

1. Expand harvest `viewsCaptured` to receipt/in_store
2. Re-parse exports + dry-run
3. Scoped apply for high-confidence only
4. Rebuild bundle → `read_model_manifest_v1_3.json`

## Commands (dry-run first)

```bash
# Amazon duplicate / return repair (dry-run)
node apps/finance/scripts/link-purchase-orders.mjs --source amazon --dry-run \
  --user-id <canonical> --updates-only --clear-stale-return-info-only \
  --only-transaction-ids <ids>

# Best Buy scoped insert candidate (dry-run)
node apps/finance/scripts/link-purchase-orders.mjs --source bestbuy --dry-run \
  --user-id <canonical> --inserts-only --only-high-confidence --max-inserts 10
```

## Success criteria

- Clean Amazon count increases without new `duplicate_risk` in read model
- Best Buy clean count > 4 with 0 Unknown account in clean view
- Each batch logged in `finance_purchase_enrichment_apply_runs`
- UI coverage dashboard reflects new clean counts live

## Explicit non-goals

- No broad `--apply` across full enriched set
- No production JSONB consumer changes (bundle/read model only for downstream)
