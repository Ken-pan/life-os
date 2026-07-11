# Finance F-P6 isolated QA authentication

**Status:** **CONDITIONAL PASS** (static tooling — 2026-07-11)
**Runtime verification:** **PENDING**
**Canonical index:** [FP6_PURCHASE_REVIEW.md](./FP6_PURCHASE_REVIEW.md)

Bootstrap scripts and documentation are prepared. **Isolated QA credentials have not been supplied**, so bootstrap ×2, teardown proof, RLS isolation, and storage-state generation have **not** been run. **No valid Antigravity storage state exists.**

---

## Environment decision

Project `iueozzuctstwvzbcxcyh` is **production**, not QA. Repository evidence:

- [docs/ops/supabase.md](../../../docs/ops/supabase.md) — shared by production Life OS apps
- [docs/security/supabase-production-fingerprint.md](../../../docs/security/supabase-production-fingerprint.md) — production fingerprint and real owner memberships

The bootstrap **refuses** the production ref. Use a **dedicated isolated non-production** Supabase project. Documented staging (`dsiloxzjnsvjnhbruibl`) is acceptable only while it remains synthetic and isolated.

**Do not** use production Supabase or real owner accounts for Finance browser QA or screenshots.

---

## Secret boundaries

### Trusted local bootstrap (operator machine only)

May briefly read from an untracked secret store:

- `FINANCE_QA_SERVICE_ROLE_KEY`
- `FINANCE_QA_DB_URL`
- newly rotated `FINANCE_QA_PASSWORD`
- project ref, URL, anon key, disposable QA email

### Antigravity (capture agent)

May receive **only**:

- UI URL (`UI_QA_URL` or equivalent)
- path to generated Playwright storage-state file
- screenshot scenario instructions

**Must never receive:**

- service-role key
- database URL
- plaintext QA password
- production owner credentials

The historical disposable password is **compromised** and must **not** be reused. Rotate before any runtime run.

---

## Bootstrap and handoff

Set these **outside git**: `FINANCE_QA_PROJECT_REF`, `FINANCE_QA_SUPABASE_URL`, `FINANCE_QA_ANON_KEY`, `FINANCE_QA_SERVICE_ROLE_KEY`, `FINANCE_QA_DB_URL`, `FINANCE_QA_EMAIL`, and a newly rotated `FINANCE_QA_PASSWORD`.

```bash
cd apps/finance
npm run qa:fp6:bootstrap
```

The server-only script ([finance-qa-bootstrap.mjs](../scripts/finance-qa-bootstrap.mjs)):

1. Refuses production project ref
2. Creates or locates a disposable user via Auth Admin (generated UUID — no fixed QA UUID in repo)
3. Grants Finance membership only
4. Seeds parameterized fixtures via `psql` (`qa_user_id`)
5. Authenticates with anon client, asserts fixture rows and RLS isolation
6. Writes mode-0600 Playwright storage state to `.tmp/finance-fp6-qa.storage-state.json`

**Do not** commit, print, or screenshot the storage-state artifact.

Antigravity consumes `UI_QA_URL` plus that generated storage-state path only.

Reset:

```bash
cd apps/finance
npm run qa:fp6:teardown
```

---

## Runtime verification gates (pending)

| Gate | Status |
| --- | ---: |
| Isolated QA project provisioned | **PENDING** |
| Bootstrap run once | **PENDING** |
| Bootstrap run twice (idempotency) | **PENDING** |
| Teardown verified | **PENDING** |
| RLS isolation asserted | **PENDING** |
| Storage state generated | **PENDING** |
| Antigravity pre-mutation baseline | **BLOCKED** |

Do **not** claim QA bootstrap or visual baseline has passed until the above are complete.

---

## Antigravity integration runbook

Prerequisites: isolated QA project + successful bootstrap (see above).

### Step sequence

| Step | Action | Owner |
| ---: | --- | --- |
| 1 | Create isolated Supabase project (same schema, no prod data) | Operator |
| 2 | Set env vars outside git; **rotate** disposable QA password | Operator |
| 3 | `npm run qa:fp6:bootstrap` | Operator |
| 4 | Re-run bootstrap (idempotency — fixture count stable) | Operator |
| 5 | Verify RLS: QA user sees only own fixtures | Bootstrap script |
| 6 | Confirm `.tmp/finance-fp6-qa.storage-state.json` exists, mode 0600, untracked | Operator |
| 7 | Pass Antigravity `UI_QA_URL` + storage-state path **only** | Operator → Antigravity |
| 8 | Run [fp6-baseline-qa.mjs](../scripts/fp6-baseline-qa.mjs) scenarios | Antigravity |
| 9 | `npm run qa:fp6:teardown`; verify clean state | Operator |

### Pre-mutation screenshot scenarios

Capture **after** storage state exists; **before** F-P6a Confirm/Reject UI:

| # | Scenario | Viewport |
| ---: | --- | --- |
| 1 | Normal History list | Desktop + mobile |
| 2 | Review Needed filter active | Desktop |
| 3 | Matched / clean enriched purchase expanded | Desktop |
| 4 | Review-needed purchase (`matched_review`) expanded | Desktop |
| 5 | Purchase with enrichment | Desktop |
| 6 | Purchase without enrichment | Desktop |
| 7 | Empty Review Needed state | Desktop + mobile |
| 8 | Error state (simulated fetch failure if script supports) | Desktop |
| 9 | Mobile review sheet / disclosure entry | Mobile |

**Post-mutation** (Confirm loading/success/error, Reject, Undo, timeout): **blocked** until F-P6a UI ships.

Optional: inject artificial delay in QA-only build to capture loading skeleton — must not ship to production.

### Security checks before sharing artifacts

- No service-role key, DB URL, or password in logs, screenshots, or report JSON
- No `.env.local` contents in Antigravity output
- Storage-state file stays local and untracked

---

## Visual baseline dependency

Pre-mutation screenshots listed in [FP6_PURCHASE_REVIEW.md](./FP6_PURCHASE_REVIEW.md) require valid isolated storage state. Confirm/Reject/Undo screenshots wait for F-P6a implementation.

---

## Related scripts

| Script | Role |
| --- | --- |
| [finance-qa-bootstrap.mjs](../scripts/finance-qa-bootstrap.mjs) | Create user, seed, auth, storage state |
| [fp6-baseline-qa.mjs](../scripts/fp6-baseline-qa.mjs) | Antigravity screenshot scenarios (needs storage state) |
| [seed_qa_amazon_enrichment.sql](../supabase/seed_qa_amazon_enrichment.sql) | Parameterized fixtures |
