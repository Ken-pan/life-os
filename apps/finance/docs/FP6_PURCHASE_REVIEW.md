# Finance F-P6 Purchase Review — Canonical Index

**Verification date:** 2026-07-11
**Section:** F-P6 discovery / product & data contract
**Overall section closure:** **CONDITIONAL PASS** — discovery can close; **implementation is not authorized.**

> **CONDITIONAL PASS** means this phase successfully answered *how the product should work* and *why the current architecture cannot implement it safely*. It does **not** mean F-P6a is ready to ship or that Confirm/Reject/Undo may be added to the existing JSONB write path.

---

## Status matrix

| Workstream | Status | Notes |
| --- | ---: | --- |
| F-P6 product contract | **PASS** | Settled semantics — see [Product contract](./FP6_PURCHASE_REVIEW_PRODUCT_CONTRACT.md) |
| F-P6 data-contract audit | **BLOCKED** | No durable association/decision model — see [Data contract](./FP6_PURCHASE_REVIEW_DATA_CONTRACT.md) |
| F-P6 QA Auth / static tooling | **CONDITIONAL PASS** | Bootstrap prepared; no isolated runtime yet — see [QA Auth](./FP6_QA_AUTH.md) |
| Isolated QA runtime verification | **PENDING** | No QA project credentials supplied; bootstrap ×2 not run |
| Antigravity desktop/mobile visual baseline | **BLOCKED** | No valid isolated QA storage state |
| F-P6 discovery / spec section | **PASS** | Product IA, mutation contract, blockers documented |
| F-P6a implementation readiness | **BLOCKED** | Requires data foundation before UI mutations |

---

## Executive summary

F-P6 discovery is complete. The **review object** is a proposed association between one bank transaction and one suggested merchant order. Confirm, Reject, and Undo semantics, desktop/mobile IA, and mutation feedback are locked in the product contract.

The **data layer is structurally blocked**: suggested-order association and enrichment currently live together in `public.finance_transactions.purchase_enrichment` JSONB. There is no durable association entity, no persisted Confirmed/Rejected state, no decision history, and no safe mutation path. **`matched_review` is a derived data-quality classification, not a review workflow state.** **`unsupported_source` is not actionable purchase review** unless a concrete transaction↔order candidate exists.

QA bootstrap tooling refuses production Supabase and parameterizes fixtures, but **isolated QA runtime verification remains pending**. Antigravity pre-mutation screenshots are **blocked** until storage state exists.

Research synthesis (user pain points, competitor patterns, phased delivery, risks, test matrix): [Implementation guide](./FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md).

---

## User goals (research-aligned)

Users need purchase review that is **fast**, **reversible**, and **transparent**:

- See bank transaction and suggested order side-by-side without parsing raw JSONB
- Confirm or reject only the **transaction↔order association**
- Receive clear success / failure / stale / timeout feedback
- Undo mistaken actions within a short client window (server authority via decision id + versions)

Industry peers (Ramp, Spendesk, Brex, Monzo, etc.) automate high-confidence matches and reserve explicit human actions for exceptions — consistent with splitting `clean_enriched` from actionable Review Needed once the data foundation exists.

---

## Canonical documents

| Document | Role |
| --- | --- |
| [FP6_PURCHASE_REVIEW_PRODUCT_CONTRACT.md](./FP6_PURCHASE_REVIEW_PRODUCT_CONTRACT.md) | Approved product semantics, IA, mutation feedback, filters, accessibility |
| [FP6_PURCHASE_REVIEW_DATA_CONTRACT.md](./FP6_PURCHASE_REVIEW_DATA_CONTRACT.md) | Current data map, blockers, future association/decision design (not implemented) |
| [FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md](./FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md) | User research, competitor patterns, timeline, risks, test matrix, Codex handoff |
| [FP6_QA_AUTH.md](./FP6_QA_AUTH.md) | Isolated QA auth, bootstrap boundaries, Antigravity handoff |

### Related historical context (not F-P6 SSOT)

| Document | Status |
| --- | --- |
| [merchant-order-audit/DOWNSTREAM_HANDOFF_v1_1.md](./merchant-order-audit/DOWNSTREAM_HANDOFF_v1_1.md) | **Historical** — enrichment read model v1.1; pre–purchase-review product contract |
| [merchant-order-audit/AUDIT_DATA_CONTEXT_v1_1.md](./merchant-order-audit/AUDIT_DATA_CONTEXT_v1_1.md) | **Historical** — operational enrichment audit; does not define user review decisions |

---

## Phase boundaries

### F-P6 (this section) — closed CONDITIONAL PASS

- Product contract: review object, Confirm/Reject/Undo, IA, mutation sequencing
- Data-contract audit: JSONB limitations, `matched_review`, `unsupported_source`, required future model
- QA Auth static preparation and secret boundaries
- Implementation gates and prohibited shortcuts

### F-P6a — **BLOCKED** until data foundation

- Association + decision-event migration
- RPC mutations with version/idempotency
- Manual-decision precedence over automated matching
- Only then: Confirm/Reject/Undo in `PurchaseEnrichmentBlock`

### F-P6b / F-P6c — out of scope for this closure

- F-P6b: return/refund follow-up, user notes
- F-P6c: Amazon/BBY curation batches (read `review_queue_v1_1`, not broad apply)

---

## Implementation blockers

1. **No association entity** — cannot prove user intent vs automated enrichment writes.
2. **No decision history or versions** — Undo, timeout reconciliation, and stale-tab safety impossible on JSONB alone.
3. **No rejected-candidate memory** — Reject by clearing JSON allows silent rematch.
4. **No manual-decision precedence** — `link-purchase-orders.mjs` and generic transaction updates can overwrite review state.
5. **Filter conflation** — Review Needed currently includes `unsupported_source` ([HistoryLedger.svelte](../../src/lib/components/HistoryLedger.svelte) L32); not yet split.
6. **No isolated QA runtime** — visual baseline and browser acceptance blocked.

---

## Prohibited shortcuts

Do **not**:

- Treat `matched_review` as a persisted review decision or `proposed` workflow state
- Treat `unsupported_source` as actionable Review Needed without a concrete association
- Add Confirm/Reject to `PurchaseEnrichmentBlock` on the current JSONB write path
- Implement Reject by clearing `purchase_enrichment`
- Implement Undo by restoring old JSON
- Use production Supabase (`iueozzuctstwvzbcxcyh`) or real owner accounts for QA/screenshots
- Claim isolated QA bootstrap, storage state, RPCs, migrations, or visual baseline have passed
- Redefine approved Fable product semantics

---

## Risks (summary)

| Risk | Mitigation |
| --- | --- |
| JSONB overwrite | Association/decision tables; never store review state in JSONB alone |
| Concurrent edits | Optimistic versioning + 409 stale conflict UX |
| Auto-match vs manual decision | Precedence rule — see [data contract](./FP6_PURCHASE_REVIEW_DATA_CONTRACT.md) |
| UI regression | Feature flag; item-scoped loading; no immediate row removal |
| QA secret leakage | Antigravity gets storage-state + URL only — [FP6_QA_AUTH.md](./FP6_QA_AUTH.md) |

Full rollback playbook: [Implementation guide — Risks](./FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md#risks--rollback).

---

## Next gates (recommended order)

```text
1. Docs consolidation (this index + implementation guide) ✅
2. Provision isolated QA Supabase project
3. Bootstrap ×2 + teardown verification + RLS isolation proof
4. Antigravity pre-mutation screenshots (History desktop/mobile baselines only)
5. Open F-P6a Data Foundation section — Codex checklist in implementation guide
6. Migration + RPC + manual-decision precedence + backend tests
7. Low-risk UI prototypes (Storybook / mock API) — optional parallel after backend tests
8. UI mutation implementation (Confirm / Reject / Undo)
9. Full E2E acceptance + post-mutation screenshots
```

Illustrative Gantt: [Implementation guide — delivery phases](./FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md#recommended-delivery-phases).

### May start now

- Isolated QA environment provision
- Bootstrap double-run and teardown verification planning
- Pre-mutation Antigravity baseline (after QA runtime)
- Association/decision migration **planning** (design only until F-P6a section opens)

### Must not start

- Real Confirm/Reject/Undo in UI
- Direct mutation of `purchase_enrichment` for review decisions
- New “Reviewed” filter without authoritative server state
- Claiming F-P6a complete

---

## Source-code index

| Path | Role |
| --- | --- |
| [packages/finance-enrichment-contract/src/classify.mjs](../../../packages/finance-enrichment-contract/src/classify.mjs) | Classification SSOT (`matched_review`, `unsupported_source`) |
| [packages/finance-enrichment-contract/src/index.d.ts](../../../packages/finance-enrichment-contract/src/index.d.ts) | Contract types |
| [packages/finance-core/src/engine/purchaseEnrichmentDisplay.ts](../../../packages/finance-core/src/engine/purchaseEnrichmentDisplay.ts) | UI display-state adapter |
| [packages/finance-core/src/engine/purchaseEnrichment.ts](../../../packages/finance-core/src/engine/purchaseEnrichment.ts) | Enrichment contract / merge |
| [packages/finance-core/src/engine/purchaseOrderMatch.ts](../../../packages/finance-core/src/engine/purchaseOrderMatch.ts) | Order matcher |
| [packages/finance-core/src/engine/transactions.ts](../../../packages/finance-core/src/engine/transactions.ts) | Transaction model |
| [packages/finance-core/src/repo/createRepo.ts](../../../packages/finance-core/src/repo/createRepo.ts) | Repository writes |
| [src/lib/components/HistoryLedger.svelte](../src/lib/components/HistoryLedger.svelte) | History list / Review Needed filter |
| [src/lib/components/HistoryLedgerRow.svelte](../src/lib/components/HistoryLedgerRow.svelte) | Row state / disclosure |
| [src/lib/components/PurchaseCoverageCard.svelte](../src/lib/components/PurchaseCoverageCard.svelte) | Review queue entry / counts |
| [src/lib/components/PurchaseEnrichmentBlock.svelte](../src/lib/components/PurchaseEnrichmentBlock.svelte) | Review evidence surface (no mutations yet) |
| [scripts/link-purchase-orders.mjs](../scripts/link-purchase-orders.mjs) | Automated matching / apply |
| [scripts/lib/purchaseEnrichmentApplyLedger.mjs](../scripts/lib/purchaseEnrichmentApplyLedger.mjs) | Operational apply logging (not user decisions) |
| [supabase/migrations/20260710160000_life_os_baseline.sql](../supabase/migrations/20260710160000_life_os_baseline.sql) | Current DB baseline |

---

## Visual baseline — pending

Pre-mutation screenshots still missing:

- Normal History desktop
- Review Needed filter desktop
- Matched purchase / review-needed purchase
- Enrichment present / absent
- Loading / empty / error states
- Mobile History
- Mobile review sheet

Confirm/Reject/Undo screenshots **depend on F-P6a implementation** and are **not** part of the pre-mutation baseline gate.
