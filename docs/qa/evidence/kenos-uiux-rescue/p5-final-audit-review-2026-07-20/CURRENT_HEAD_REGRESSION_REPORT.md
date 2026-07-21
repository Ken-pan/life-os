# CURRENT_HEAD_REGRESSION_REPORT

Audit HEAD: `37d3af2b980c2d8466ab9865ea578702fd7a4782`
Functional canonical (frozen, not rewritten): `continuity-e2e-2026-07-20T20-12-22-998Z`

## Verdict for this gate

```text
CURRENT-HEAD REGRESSION: HOLD
```

Not product-attributed to Knife 6 UI. Still **not PASS**, so Owner Review stays closed.

---

## Runs examined

### A. `continuity-e2e-2026-07-21T00-40-41-010Z`

| Field         | Value                                                               |
| ------------- | ------------------------------------------------------------------- |
| Failure class | **environment**                                                     |
| Symptom       | `page.goto net::ERR_CONNECTION_REFUSED` at `http://127.0.0.1:5188/` |
| Stamps        | Flow A/B NOT_YET_VALIDATED · isolation PARTIAL · overall NOT_PASSED |
| Knife 6 link  | None — planner preview/dev not accepting connections                |

### B. `continuity-e2e-2026-07-21T00-41-43-233Z` (primary PARTIAL)

| Field               | Value                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Failure class       | **environment / fixture** (domain app runtime), not Kenos Continue UI                                                                     |
| Flow A              | PARTIAL — `Failed to fetch dynamically imported module: http://127.0.0.1:5188/src/lib/sync.js` → `#task-title` missing → cannot UI-mutate |
| Flow B              | PARTIAL — set2 precondition failed (`onSet2=false`, CTA empty); Fitness Focus Continue missing                                            |
| Account isolation   | **VALIDATED** (API + dual UI + account switch; B does not leak A Recent)                                                                  |
| Continue empty copy | Present in dual-UI snippets (Knife 6 empty state language)                                                                                |

Root chain:

1. Planner sync seed via `/src/lib/sync.js` failed to load in the browser session.
2. Without sync/editor hydration, Flow A mutation path aborted (`#task-title` missing).
3. Fitness focus progression never reached set2 CTA → Flow B aborted before Continuity handoff assertions.
4. Kenos isolation path still ran and **passed**.

This is **not** evidence that Knife 6 broke descriptor schema, deep links, or account binding. It **is** insufficient proof that Planner/Fitness Continue restore still works on this HEAD.

---

## Owner Review minimum checklist vs HEAD

| Required smoke                            | HEAD status                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Planner Continue restores correct context | **UNPROVEN** (Flow A PARTIAL)                                                     |
| Fitness Continue restores correct set     | **UNPROVEN** (Flow B PARTIAL)                                                     |
| Account B shows no Account A Recent       | **PASS** (`…T00-41-43` isolation VALIDATED)                                       |
| expired / deleted target degrades safely  | **UNIT / UI fixture PASS** (`productStates` + SpaceSwitcher forget); not full E2E |
| duplicate Continue click launches once    | **CODE + unit path PASS** (`launchInFlight` 700ms guard); not full E2E            |

---

## Targeted substitutes run at audit time

| Check                                                                                      | Result                                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `spaceSwitcher.core` / `productStates` / overlay mode+anchor / `domainIdentity` unit tests | **34/34 PASS**                                                                                               |
| Live Continue Escape + focus return @ 5197                                                 | PASS                                                                                                         |
| Live offline banner @ 5197                                                                 | PASS                                                                                                         |
| Ports at audit                                                                             | aios 5197 · planner 5188 · fitness 5190 listening (note: PARTIAL run still failed sync module fetch earlier) |

---

## Honesty rule applied

- Old canonical `…T20-12-22-998Z` remains the frozen functional proof that the continuity **contract** once fully passed.
- It does **not** auto-clear current-HEAD regression after Knife 6 consumer-layer changes (launch debounce, expired/empty UI, sanitize).
- Unexplained PARTIAL would block visual-adjacent claims; **explained** PARTIAL still leaves regression **HOLD**.

## Recommendation (outside this audit)

Re-run `scripts/qa/kenos-space-continuity-e2e-flows.mjs` only after confirming planner Vite serves `/src/lib/sync.js` (or switch the harness to a preview-safe sync push path). Do not reopen Owner Review on isolation-only evidence.
