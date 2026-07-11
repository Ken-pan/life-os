# Finance F-P6 Purchase Review — Product Contract

**Status:** **PASS** (approved 2026-07-11)
**Owner:** Fable (product semantics)
**Canonical index:** [FP6_PURCHASE_REVIEW.md](./FP6_PURCHASE_REVIEW.md)

This document is the SSOT for user-facing purchase-review behavior. **Implementation is blocked** until the [data contract](./FP6_PURCHASE_REVIEW_DATA_CONTRACT.md) foundation exists.

---

## Review object

The user reviews **one proposed association** between:

- one **bank transaction**; and
- one **suggested merchant purchase / order**.

The user is **not** reviewing the entire transaction record, category, merchant normalization, or full enrichment payload as a single approve/reject unit.

---

## Confirm

**User-facing label:**

```text
Confirm match
```

**Meaning:**

```text
This bank transaction corresponds to this suggested order.
```

**Does not approve:**

- the raw bank transaction as correct in all fields
- transaction category
- merchant normalization
- every line item
- every enrichment field
- the matching algorithm permanently

---

## Reject

**User-facing label:**

```text
Not this order
```

**Meaning:**

```text
The displayed order is not the purchase represented by this transaction.
```

**After Reject:**

- the raw bank transaction is preserved and unchanged
- the current candidate association is marked rejected (server-side, once implemented)
- a different candidate may appear later as a **new** association
- the **same** rejected candidate must not silently resurface as an ordinary new suggestion
- Reject does **not** delete the order or negate all enrichment globally

---

## Undo

| Rule | Detail |
| --- | --- |
| Scope | Both Confirm and Reject expose temporary Undo |
| Client window | **10 seconds** — presentation affordance only |
| Server correctness | Must **not** depend on the browser timer |
| Target | Exact `decision_id` + association version |
| Navigation / refresh | May end the temporary Undo UI; prior decision remains unless Undo succeeds |
| Failed Undo | Prior completed decision stays in effect |
| Timeout / unknown result | Must not be presented as a generic failure; requires reconciliation |

Codex guidance: the 10-second window is a **client affordance**; the server decides Undo legality from decision id, association version, and current authoritative state.

---

## State model (product)

Product-facing states (once data foundation exists):

| State | User meaning |
| --- | --- |
| `proposed` | Actionable candidate awaiting Confirm or Reject |
| `confirmed` | User accepted transaction↔order association |
| `rejected` | User rejected this specific candidate |

**Today:** no persisted product review states exist. UI display states (`clean_enriched`, `matched_review`, etc.) are **derived classification**, not review workflow states — see [Data contract](./FP6_PURCHASE_REVIEW_DATA_CONTRACT.md).

---

## Design principles (research-backed)

- **Single review object** — only the transaction↔order association is confirmed or rejected
- **Automate clean, queue exceptions** — high-confidence enrichments should not consume review attention (future queue uses authoritative `proposed`, not raw `matched_review` alone)
- **Evidence before action** — user sees bank txn summary and suggested order side-by-side (Ramp / Spendesk / Monzo pattern)
- **Explicit outcomes** — success, error, stale conflict, and timeout-unknown are visually distinct (not silent state changes)
- **Reversible mistakes** — Undo within client window; server decides legality

Competitor synthesis: [Implementation guide](./FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md#competitor-patterns-research-synthesis).

---

## Information architecture

### Desktop (recommended — matches Fable IA)

```text
History ledger row
  → Review needed badge / disclosure
  → expanded PurchaseEnrichmentBlock
  → suggested order evidence
  → Confirm match / Not this order
```

Confirm and Reject are **not** embedded in the dense ledger row.

### Mobile

```text
History row
  → Review match
  → bottom sheet or full-height review sheet
  → transaction summary + suggested order evidence
  → sticky Confirm match / Not this order
```

**Avoid:**

- two tiny row-level buttons
- swipe-only actions
- hard-to-undo destructive patterns

### Component responsibilities

| Component | Owns |
| --- | --- |
| `PurchaseCoverageCard` | Queue entry, coverage counts, filter presets — **not** per-item mutations |
| `PurchaseEnrichmentBlock` | Suggested order evidence, Confirm/Reject actions, item-level mutation feedback |
| `HistoryLedgerRow` | Row badge, disclosure entry to review surface |

---

## `PurchaseEnrichmentBlock` responsibilities

- Mark **Suggested order** distinctly from the raw bank transaction
- Show order date, total, ID, status, line items
- Surface partial / ambiguous evidence
- Host Confirm / Reject (when implemented)
- Host loading, success, Undo, and error feedback per item

---

## Mutation feedback contract

**Sequence:**

```text
Click action
  → disable conflicting controls for this item
  → show in-button loading
  → wait for authoritative server result
  → on success: show state + Undo affordance
  → keep row visible ~10s (client)
  → then remove from Review Needed queue
```

**Must not:**

- remove the row immediately on click
- show Confirmed before server success
- blind-retry immediately after timeout
- collapse, navigate away, or reorder the list on failure

### Feedback channels

| Channel | Role |
| --- | --- |
| Inline notice | Primary success / error / Undo |
| Toast | Secondary entry to Undo |

### Error classes

- **Hard failure** — show error; decision unchanged
- **Stale conflict** — show conflict; refresh authoritative state
- **Timeout / unknown** — reconcile; do not masquerade as ordinary failure

---

## Filter behavior

### Review Needed (target behavior)

Should include only items with:

- a stable transaction↔order candidate
- sufficient evidence for Confirm/Reject
- authoritative `proposed` state (once implemented)

### Current gap (not yet implemented)

Today `purchase:review` includes both `matched_review` **and** `unsupported_source` in [HistoryLedger.svelte](../src/lib/components/HistoryLedger.svelte). **`unsupported_source` ≠ actionable purchase review.** Filter split is documented in the data contract; **no filter change has shipped.**

### Future split

| Type | UX |
| --- | --- |
| Actionable association review | Review Needed — Confirm/Reject |
| Source / enrichment coverage issue | Informational — no Confirm/Reject |
| No concrete candidate | Not in purchase-review queue |

Do **not** add a “Reviewed” filter until authoritative server review state exists.

---

## UX pattern alternatives (ranked)

Research evaluated three desktop and three mobile patterns. **Fable-approved IA remains the primary path** below.

### Desktop

| Rank | Pattern | Use when | Notes |
| ---: | --- | --- | --- |
| **1 (primary)** | Expandable `PurchaseEnrichmentBlock` in ledger row | Default History review | Balanced density; aligns with existing component |
| 2 | Dedicated review detail page | Multi-candidate or heavy evidence | Preserve filter context on back-nav |
| 3 (avoid) | Row-inline Confirm/Reject only | Never as primary | Insufficient evidence surface; high mis-tap risk |

**Expandable block — interaction detail:**

- User opens row disclosure → panel shows bank txn + suggested order + line items
- Actions at panel bottom; in-button spinner while pending
- Success: inline notice + Undo link; toast as secondary Undo entry
- Failure: inline error at panel top + retry; stale: refresh authoritative state

### Mobile

| Rank | Pattern | Use when | Notes |
| ---: | --- | --- | --- |
| **1 (primary)** | Bottom sheet / full-height review sheet | Default | Sticky Confirm / Not this order |
| 2 | Full-screen review route | Complex multi-candidate | Confirm back navigation does not lose queue context |
| 3 (avoid) | Swipe-only / gesture-only | Never as primary | Poor a11y; hard Undo |

Mobile sheet should use `role="dialog"` (or equivalent) when implemented; motion must not block screen reader access.

---

## Low-risk prototypes (pre-implementation)

Before wiring real RPCs, validate UX with:

1. **Prototype A** — Storybook / static mock states (no backend)
2. **Prototype B** — Mock API behind feature flag in QA/dev only

Details and acceptance criteria: [Implementation guide — prototypes](./FP6_PURCHASE_REVIEW_IMPLEMENTATION_GUIDE.md#low-risk-frontend-prototypes-pre-f-p6a-ui).

Prototypes **do not** replace the data foundation or authorize JSONB mutations.

---

## Accessibility

- Confirm and Reject must be reachable by keyboard when the review surface is open
- Expand/collapse: `aria-expanded` on disclosure trigger; semantic structure for txn (`dl`) and line items (`table` or list)
- Loading states exposed to assistive tech (`aria-busy`, disabled state)
- Success/failure: prefer `aria-live="polite"` region for inline notice (not toast-only)
- Action labels: e.g. `aria-label="Confirm match for this suggested order"` where visible text is abbreviated
- Undo announced when it becomes available; time-limited affordance must not be the only recovery path for errors
- Focus order: evidence before actions; sticky actions on mobile must not trap focus
- WCAG-aligned: visible focus rings; sufficient contrast on error/success states

---

## Edge cases

| Case | Expected behavior |
| --- | --- |
| Same candidate after Reject | Must not reappear as a silent new suggestion |
| Different candidate after Reject | New association; user may review again |
| Confirm then enrichment refresh | Non-identity enrichment may update; pair must stay confirmed |
| Automated rematch | Must not override manual Confirm/Reject for same stable association |
| Stale tab | Server version conflict; no silent overwrite |
| Duplicate click / double submit | Idempotent via `action_key` + expected versions |
| Offline / timeout | Unknown outcome; reconcile before new attempt |

---

## Explicit non-goals (F-P6a scope)

- Approving category or merchant normalization
- Bulk approve/reject entire History page
- Swipe gestures as primary action
- Persisting Undo UI across sessions
- Using `matched_review` classification alone as queue membership
