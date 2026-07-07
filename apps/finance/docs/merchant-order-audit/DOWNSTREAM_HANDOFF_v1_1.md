# Downstream Handoff — Merchant Order Read Model v1.1

## Status

| Field | Value |
|-------|-------|
| **Status** | Ready as **partial clean purchase dataset** |
| **Version** | v1.1 (frozen after Target final batch apply) |
| **Bundle** | `tools/web-state-devtools/bridge/data/merchant-order-audit-20260707-1620-after-target-final/` |
| **Generated at** | `2026-07-07T23:19:00.079Z` (see `read_model_manifest_v1_1.json`) |
| **Git HEAD (apply session)** | `1b18c5785fb8bb7762e9d7a485755dc506448758` |
| **Canonical user** | `c2831538-94b0-4a57-b034-5e873a53c42e` |
| **Producer** | Finance OS merchant order enrichment pipeline |
| **Owner / contact** | Life OS Finance (`apps/finance`) — Ken Pan workspace |

v1.1 extends v1 with **21 additional Target in_store clean rows** (Target Circle Card, high confidence). Broad apply remains **not approved**.

---

## Safe files (consumers may load)

| File | Format | Purpose |
|------|--------|---------|
| `read_model/merchant_orders_clean_v1_1.jsonl` | JSONL | Primary clean order feed |
| `read_model/merchant_orders_clean_v1_1.csv` | CSV | Same orders, tabular |
| `read_model/merchant_items_clean_v1_1.jsonl` | JSONL | Clean line items |
| `read_model/merchant_items_clean_v1_1.csv` | CSV | Same items, tabular |
| `read_model/read_model_manifest_v1_1.json` | JSON | Version, stats, file list |
| `read_model/read_model_summary_v1_1.md` | Markdown | Counts and delta from v1 |
| `read_model/README_downstream_contract.md` | Markdown | Full contract (field rules, exclusions) |
| `qa/read_model_quality_report_v1_1.md` | Markdown | Per-source quality scores |
| `qa/read_model_quality_report_v1_1.json` | JSON | Machine-readable quality report |
| `reconciliation/raw_vs_db_reconciliation_v1_1.md` | Markdown | Raw export vs DB gaps |

### Review-only (not product truth)

| File | Purpose |
|------|---------|
| `read_model/review_queue_v1_1.jsonl` | Excluded/risky rows with `reasons[]` — dashboards & cleanup only |

---

## Forbidden files / usage

- **Do not** read `finance_transactions.purchase_enrichment` directly in production consumers
- **Do not** treat `review_queue_v1_1.jsonl` as clean purchase truth
- **Do not** assume Amazon / Best Buy clean subsets are full merchant coverage
- **Do not** use clean v1.1 alone for returns/refunds, net-spend, or accounting reconciliation
- **Do not** run broad `--apply` or mutate DB based on this bundle
- **Do not** use v1 files (`*_v1.jsonl`) for new integrations — prefer `*_v1_1.*`
- **Do not** assume idempotent DB writes or unique constraints on enrichment

---

## Counts by source

| source | clean orders | clean items | review queue | DB enriched | notes |
|--------|-------------:|------------:|-------------:|------------:|-------|
| **target** | **81** | **295** | 1 | 82 | **Primary** v1.1 dataset; in_store Target Circle Card |
| **amazon** | 20 | 23 | 121 | 141 | Cautious high-confidence subset only |
| **bestbuy** | 4 | 13 | 46 | 50 | Small high-confidence slice |
| **total** | **105** | **331** | **168** | 273 canonical | Partial history, not full raw (483 orders) |

**Delta from v1:** Target clean +21, overall clean +21, Target enriched 61 → 82.

---

## Schema version

- **Read model version:** `v1.1` (`read_model_manifest_v1_1.json` → `version`)
- **Parent:** `v1` — same field shapes; no breaking removals
- **Order required fields:** `userId`, `transactionId`, `source`, `merchantAccount`, `transactionDate`, `matchConfidence`, `status`, `itemCount`, `hasReturnInfo`
- **Item required fields:** `userId`, `transactionId`, `source`, `lineIndex`, `title`, `quantity`
- **Join key:** `transactionId` (items → orders)
- **Money fields:** integer cents (`totalCents`, `transactionAmountCents`, `amountDiffCents`)

---

## Quality guarantees (clean v1_1 only)

| Guarantee | Target | Amazon | Best Buy | All clean |
|-----------|--------|--------|----------|-----------|
| Duplicate `transactionId` | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| `merchantAccount` = Unknown | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| Returned / refunded / cancelled | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| `hasReturnInfo` = true | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| Missing item title | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| Missing item quantity | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| Orphan items (no parent order) | ✓ 0 | ✓ 0 | ✓ 0 | ✓ 0 |
| `itemCount` matches item rows | ✓ | ✓ | ✓ | ✓ |
| High confidence (Target) | ✓ 81/81 | — | — | — |
| `imageStoragePath` (Target items) | ✓ present | n/a | n/a | — |

Smoke-tested read-only on bundle load (see handoff report).

---

## Non-guarantees

- Not full merchant order history (raw: 483 orders; clean: 105)
- Not complete returns/refunds model
- Not a financial ledger or audit trail
- Amazon/Best Buy clean rows are **curated subsets**, not exhaustive enriched DB
- 1 Target row remains in review queue (outside the 21 applied batch)
- Broad apply (Amazon / Best Buy / Target bulk) **not approved**
- Amazon `status` strings are raw merchant text, not normalized enums
- Overall quality score **52/100** (Target 98, Amazon 31, Best Buy 28)

---

## Example consumer queries

### Node — load clean orders + items

```javascript
import fs from 'node:fs'

const bundle = 'tools/web-state-devtools/bridge/data/merchant-order-audit-20260707-1620-after-target-final/read_model'
const orders = fs.readFileSync(`${bundle}/merchant_orders_clean_v1_1.jsonl`, 'utf8')
  .trim().split('\n').map(JSON.parse)
const items = fs.readFileSync(`${bundle}/merchant_items_clean_v1_1.jsonl`, 'utf8')
  .trim().split('\n').map(JSON.parse)

const itemsByTxn = new Map()
for (const it of items) {
  if (!itemsByTxn.has(it.transactionId)) itemsByTxn.set(it.transactionId, [])
  itemsByTxn.get(it.transactionId).push(it)
}

// Target in_store purchases only
const targetClean = orders.filter(o => o.source === 'target' && o.sourceView === 'in_store')
```

### jq — count by source

```bash
jq -s 'group_by(.source) | map({source: .[0].source, n: length})' \
  read_model/merchant_orders_clean_v1_1.jsonl
```

### jq — items for one transaction

```bash
TXN="2b582668-a8c7-411c-931b-15ccfa2b67fc"
jq -c --arg t "$TXN" 'select(.transactionId == $t)' \
  read_model/merchant_items_clean_v1_1.jsonl
```

### SQL-shaped filter (in-memory)

```javascript
orders.filter(o =>
  o.source === 'target' &&
  o.matchConfidence === 'high' &&
  o.amountDiffCents <= 1 &&
  o.itemCount > 0
)
```

---

## Review queue usage

- Load `review_queue_v1_1.jsonl` for **ops dashboards and cleanup prioritization only**
- Each row: `transactionId`, `source`, `reasons[]`, `suggestedNextAction`, snapshot `order`
- Group by `reasons` to plan batch fixes (see `read_model_summary_v1_1.md` / quality report)
- **Never** merge review rows into clean feeds without re-running read model build
- Top exclusion reasons (168 rows): `non_clean_status` (124), `returned_or_refund_excluded` (68), `duplicate_risk` (55), `low_or_medium_confidence` (38), `amount_mismatch` (30), `missing_items` (22), `unknown_account` (14)

---

## Contact / owner notes

- **Producer pipeline:** `apps/finance/scripts/link-purchase-orders.mjs`, `tools/web-state-devtools/bridge/scripts/build-merchant-order-audit-bundle.mjs`
- **Read model engine:** `tools/web-state-devtools/bridge/scripts/merchant-read-model-v1.mjs`
- **Apply policy:** Scoped `--only-transaction-ids` batches only; broad apply requires explicit approval
- **Regeneration:** Re-run audit bundle script after approved applies; bump manifest `generatedAt`
- **Questions:** Life OS monorepo Finance app maintainers

---

## Next planned versions

| Version | Scope | Status |
|---------|-------|--------|
| **v1.1** | Target final 21 inserts → 81 clean Target rows | **Current / frozen** |
| **v1.2** | Amazon targeted cleanup (duplicate/return/unknown repair) | Planned, not approved |
| **v1.3** | Best Buy targeted cleanup | Planned, not approved |
| **v2** | Breaking schema (normalized status enum, returns model, idempotency fingerprint) | Future |

---

## Quick reference

```
clean_v1_1 = high-confidence matched purchases (105 orders, 331 items)
primary    = Target 81 in_store rows (Target Circle Card)
cautious   = Amazon 20 + Best Buy 4 subsets
exclude    = review_queue_v1_1 (168 rows) — not product truth
```
