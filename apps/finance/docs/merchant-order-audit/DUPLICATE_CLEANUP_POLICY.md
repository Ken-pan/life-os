# Duplicate Cleanup Policy

> **Gate:** Required before partial unique index or broad apply (P0-1).

## Current state (v1.1)

| Source | Review queue | Top reasons |
|--------|-------------:|-------------|
| Amazon | 121 | `non_clean_status`, `duplicate_risk`, `returned_or_refund_excluded` |
| Best Buy | 46 | `duplicate_risk`, `low_or_medium_confidence` |
| Target | 1 | residual |

## Classification workflow

1. Export `review_queue_v1_1.jsonl` from frozen bundle
2. Group by `reasons[]` priority:
   - `duplicate_risk` — manual pick canonical txn per `(source, orderId)`
   - `returned_or_refund_excluded` — exclude from clean; route to returns workflow
   - `low_or_medium_confidence` — re-link or scoped apply after harvest fix
   - `unknown_account` — resolve account mapping
3. Record decision in apply run ledger (`reason` field)
4. Rebuild read model; verify clean counts

## Duplicate resolution rules

| Case | Action |
|------|--------|
| Same `orderId`, two txns, one clearly wrong date/amount | Keep higher-confidence txn; null or fix other |
| Same `orderId`, both plausible | **Do not** auto-merge — human review |
| Same `mergeKey`, different `transactionId` | Deduplicate before apply |

## Broad apply blocker

Until duplicate groups are **zero or explicitly waived** in writing:

- No broad `--apply`
- No partial unique index deployment
- UI continues to show `matched_review` for duplicate rows
