# Finance Enrichment Backlog (from AUDIT R-01–R-09 / §18)

> Create GitHub issues with label `finance-enrichment`. Copy titles below.

## P0 — before broad apply

- [ ] **R-01** Duplicate cleanup (Amazon 121 + Best Buy 46 review rows)
- [ ] **R-02** Apply ledger migration approved + verify CLI writes
- [ ] **P0-2** Partial unique index (after cleanup) — DO NOT APPLY YET
- [ ] **P0-4** Broad apply approval workflow (`approved_by` field)
- [ ] **P0-6** Review queue batch plan (168 rows by `reasons[]`)
- [ ] **P0-7** Dry-run report archive before any scoped apply

## P1 — before external consumers

- [ ] **P1-1** Downstream contract sign-off (v1.1 only; no accounting from status)
- [ ] **P1-2** `schemaVersion: 1` on all new applies (code landed; verify in prod)
- [ ] **P1-3** Extracted columns or read-model table design
- [ ] **P1-4** Storage risk acceptance or hash-path rollout
- [ ] **P1-5** Normalized status enum (v2)
- [ ] **P1-6** Per-source coverage declaration for integrators

## P2 — cleanup / nice-to-have

- [ ] **R-09** `finance_data` legacy archive
- [ ] **P2-2** Returns accounting read model (v2)
- [ ] **P2-3** Best Buy in-store harvest coverage
- [ ] **P2-5** Scheduled read-only audit bundle CI
- [ ] **P2-7** Evaluate separate `finance_merchant_orders` table

## Open decisions

1. Partial unique key for in_store receipts (`mergeKey` vs `orderId`)
2. Storage v2: private bucket + signed URL timeline
3. Amazon/Best Buy batch sizes per scoped apply
4. Who signs `approved_by` for broad apply
