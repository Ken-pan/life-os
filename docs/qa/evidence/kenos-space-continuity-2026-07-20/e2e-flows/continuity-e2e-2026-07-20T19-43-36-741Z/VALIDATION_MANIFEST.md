# Continuity Validation Evidence Audit

**Audit-only.** No visual polish. No scope expansion.
**Canonical run (only):** `continuity-e2e-2026-07-20T19-43-36-741Z`
**Superseded run:** `continuity-e2e-2026-07-20T19-36-27-382Z` → **SUPERSEDED** (do not mix frames).

## Gate summary (audit result)

| Gate | Prior claim (run SUMMARY) | Audit result | Reason |
| ---- | ------------------------- | ------------ | ------ |
| Continuity Contract | IMPLEMENTED | **IMPLEMENTED** | Shared ResumeDescriptor / adapters / Continue store present |
| Fitness Continuity | VALIDATED | **CONDITIONAL** (VALIDATED\*) | Set ladder + Continue resume proven; reload Set3 is **before** `cloudPush` → not proven cold restore from DB alone |
| Planner Continuity (overall) | VALIDATED | **PARTIAL** | Entity restore OK; mutation was admin upsert; Kenos summary delta not shown; `reloadSeesTask: false` |
| — Planner entity restore | — | **VALIDATED** | A02 → A05 → A06 same task deep-link |
| — Planner mutation persistence | — | **PARTIAL** | DB `completed=true` via **admin** write + user client read; not Planner UI save path |
| — Planner → Kenos summary sync | — | **NOT_PROVEN** | Continue shows bare “Plan”; no Today/Inbox delta after complete |
| — Reload / re-login persistence | — | **FAILED / NOT_PROVEN** | `flowA.reload.reloadSeesTask: false` |
| Account Isolation | VALIDATED | **CONDITIONAL** | Two real auth UIDs + API/RLS 0 + dual-UI no leak in report; frames not watermarked with UID (binding is in this manifest) |
| Visual Quality | IN_PROGRESS | **IN_PROGRESS** | unchanged |
| Owner Review | — | **NOT OPEN** | |

\* Owner rule: Fitness VALIDATED only if reload Set3 is shown to come from persistent layer, not only in-tab memory.

## Environment

| Field | Value |
| ----- | ----- |
| git commit SHA (workspace at audit) | `0bd3662578435e38188e3e81978137b1bd47433e` |
| Note on SHA | Evidence run may predate this commit tip; script = `scripts/qa/kenos-space-continuity-e2e-flows.mjs`. Treat SHA as audit-time workspace identity, not guaranteed byte-identical to the browser bundles served on 5188/5190/5197 during the run. |
| Environment | Local vite **dev**: AIOS `127.0.0.1:5197`, Planner `5188`, Fitness `5190` |
| Test command | `node scripts/qa/kenos-space-continuity-e2e-flows.mjs` |
| Exit code (19:43 run) | `0` (process completed; stamps written by script — audit **overrides** overclaimed VALIDATED) |
| Evidence dir | `docs/qa/evidence/kenos-space-continuity-2026-07-20/e2e-flows/continuity-e2e-2026-07-20T19-43-36-741Z/` |
| Machine report | `report.json` · `SUMMARY.md` |

## Identities (redacted presentation)

| Context | Email | auth_uid (full in report.json) | Short |
| ------- | ----- | ------------------------------ | ----- |
| Browser A | 334452284ken@gmail.com | `c2831538-94b0-4a57-b034-5e873a53c42e` | `…c42e` |
| Browser B | pettimes666666@gmail.com | `8febdb83-ec49-467d-a9bf-d42620cc68fe` | `…68fe` |

## Entities

| Kind | ID |
| ---- | -- |
| Planner task | `kenos-cont-mrtmua79` |
| Task title | `Continuity Planner Test 0T19-43-36-741Z` |
| Fitness exercise | `c_fly` |
| Day | `chest` · date `2026-07-20` |
| Fitness session (A, today chest) | `2569404f-5600-43dd-90bf-2536741cfe47` |

## Timeline

| | |
| - | - |
| startedAt | `2026-07-20T19:43:36.742Z` |
| finishedAt | `2026-07-20T19:44:07.439Z` (isolation.final) |

---

## Fitness gate (step audit)

| Step | Expected | Actual | Evidence | Pass? |
| ---- | -------- | ------ | -------- | ----- |
| At Set 2 after set1 complete | nextSet=2 | nextSet=2 done=1 | `B02`, `flowB.set2Visible` | YES |
| Kenos Continue shows Set 2 | subtitle Set 2 of 3 | descHasSet2=true | `B03`/`B04`, `flowB.continueSheet.set2` | YES |
| Resume from Kenos to Set 2 | landedSet2 | landedSet2=true nextSet=2 | `B05`, `flowB.resumedSet2` | YES |
| Complete set → Set 3 | nextSet=3 | nextSet=3 done=2 | `B06`, `flowB.afterCompleteSet2` | YES |
| Kenos shows Set 3 | Set 3 of 3 | snippet has Set 3 | `B07`, `flowB.continueSheet.afterSet2` | YES |
| Resume Set 3 | onSet3 | onSet3=true | `B08`, `flowB.set3Visible` | YES |
| Reload still Set 3 | stillSet3 from persistence | stillSet3=true **then** `cloudPush.ok` | `B09`, `flowB.reload` @19:44:05 · `flowB.cloudPush` @19:44:06 | **CONDITIONAL** — reload precedes cloud push; local log restore proven; **cold DB-only restore not isolated** |
| Cloud write | push OK | ok=true · network POSTs to `fitness_exercise_logs` | `flowB.cloudPush`, `report.network` | YES (after reload) |

**Fitness audit stamp: CONDITIONAL (VALIDATED\*)**

---

## Planner gate (step audit)

| Step | Expected | Actual | Evidence | Pass? |
| ---- | -------- | ------ | -------- | ----- |
| Open seeded task (not home) | task visible | taskVisible / titleInInput | `A02`, `flowA.taskVisible` | YES |
| Continue shows Plan | planInSheet | true | `A05` | YES |
| Resume same task | editor for same title | A06 shot | `A06` | YES → **entity restore VALIDATED** |
| Edit notes in UI | notes changed | `A03` filled notes | `A03` | YES (UI edit exists) |
| Persist mutation | UI save → DB | **admin upsert** `completed=true` | `flowA.db.admin_after` | **PARTIAL** — write path is service-role, not Planner client save |
| User client sees completed | completed true | completed true | `flowA.db.after` | YES (read after admin write) |
| Kenos summary updates after mutation | Today/Recent/Inbox reflect complete | Continue still “Plan” / “Plan”; Today “登录或权限失效” | `A04`/`A05` snippets | **NOT_PROVEN** |
| Reload + re-login still see task | reloadSeesTask | **false** | `A07`, `flowA.reload` | **FAIL** |

**Planner overall audit stamp: PARTIAL**
**Planner entity restore: VALIDATED**

---

## Account isolation gate (step audit)

| Step | Expected | Actual | Evidence | Pass? |
| ---- | -------- | ------ | -------- | ----- |
| Two distinct auth users | different UIDs | `…c42e` vs `…68fe` | `report.accounts`, `auth.sessions` | YES |
| A task visible to A only | A_rows=1 B_rows=0 | yes | `db.before`, `db.finalIsolation` | YES |
| B cannot list A fitness sessions | B_sees_A_sessions=0 | 0 | `flowB.db.isolation` | YES |
| Continue A has Training/Plan Recent | aHasTrainingOrPlan | true | `C01`, `isolation.dual_ui.A` | YES |
| Continue B no A entity leak | bLeaksA false | false · empty Recent | `C02`, `isolation.dual_ui.B` | YES |
| Switch A→B no leak | switchLeaksA false | false | `C03`, `isolation.account_switch` | YES |
| Frames bound to auth UID | watermark / caption | **binding only in this manifest** (PNG not stamped) | this file | **CONDITIONAL** |

**Account isolation audit stamp: CONDITIONAL**

Domain catalog (Training/Plan/…) visible to B is **expected** and not a leak.

---

## Evidence hygiene

| Run | Status |
| --- | ------ |
| `…T19-43-36-741Z` | **CANONICAL** for this audit |
| `…T19-36-27-382Z` | **SUPERSEDED** — Planner/Account were PARTIAL; do not mix into Verification Sheet |
| Sheet frames | All nine cells in `CONTINUITY_VERIFICATION_EVIDENCE_SHEET.png` must map only to 19:43 files (see `validation-results.json` frameIndex) |

## Machine-readable twin

See `validation-results.json` in this directory.

## Final stamps to publish

```text
KENOS SPACE CONTINUITY CONTRACT — IMPLEMENTED
KENOS FITNESS SPACE CONTINUITY — CONDITIONAL   # VALIDATED* pending reload-from-DB isolation
KENOS PLANNER SPACE CONTINUITY — PARTIAL       # entity restore VALIDATED; mutation/summary/reload incomplete
KENOS CONTINUE ACCOUNT ISOLATION — CONDITIONAL # API+dual-UI OK; UID↔frame binding via manifest only
KENOS DOMAIN EXPERIENCE — NATIVE_AND_CONTINUOUS (direction)
KENOS UIUX VISUAL QUALITY — IN_PROGRESS
OWNER REVIEW — NOT OPEN
```
