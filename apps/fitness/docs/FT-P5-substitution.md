# Fitness GYMS.SUB.5 — Substitution Flow (Canonical)

**Verification date:** 2026-07-11
**Section:** GYMS.SUB.5 state model · engineering gate · product review
**Overall release readiness:** **PASS** — GYMS.SUB.5 ✅ Complete; Engineering PASS; Product gate PASS; shipped in #19 (`67e72b81`).

> **Product gate closed:** selected substitute state, accessible `aria-pressed`, replacement copy, Focus relationship copy, and Summary `Replaced` label were accepted. Evidence: [`docs/qa/evidence/gyms-sub-5/`](../../../docs/qa/evidence/gyms-sub-5/).

---

## Status matrix

| Gate | Status | Notes |
| --- | ---: | --- |
| State model (planned vs performed) | **PASS** | `sessionQueue.js` · `session.js` |
| Focus substitution execution | **PASS** | Substitute occupies the original slot |
| Set attribution | **PASS** | Original and substitute sets recorded separately |
| Queue identity | **PASS** | No deduplication by `exerciseId` |
| Reload / next-back persistence | **PASS** | Substitute survives navigation and reload |
| Summary / Stats / progression / Coach | **PASS** | Performance attributed to performed exercise |
| Product understandability | **PASS** | Selected state visible; `aria-pressed`; replacement copy and outcome labels verified |
| **GYMS.SUB.5 overall** | **PASS** | Engineering PASS · Product gate PASS · #19 `67e72b81` |

```text
GYMS.SUB.5 engineering gate: PASS
GYMS.SUB.5 product gate: PASS
GYMS.SUB.5 overall release readiness: PASS
```

---

## Executive summary

GYMS.SUB.5 replaces the old skip-only bookkeeping with a stable **planned slot / performed exercise** model. Substitution changes which exercise is performed in a slot without collapsing slot identity or moving completed sets.

**Engineering is complete and verified** by focused Playwright tests and build/check gates.

**Product gate is PASS.** The selected state is visibly persistent and exposed through `aria-pressed`; partial completion uses replacement terminology; Focus states the planned exercise; and Summary labels the original as `Replaced`.

**Closure evidence:** `npm run check` PASS; `tests/substitution.spec.js` 6/6 PASS; 393×852 live replacement smoke PASS with no horizontal overflow; screenshots in [`docs/qa/evidence/gyms-sub-5/`](../../../docs/qa/evidence/gyms-sub-5/).

---

## Original root cause

```text
skipExercise() persisted substituteId, but Focus, progression,
Summary, and statistics continued consuming the planned exercise array.
```

The skip path recorded a substitute ID on the log without driving Focus, set logging, progression, Summary, or Stats from the performed exercise.

---

## Corrected state model

```text
planned slot identity remains stable
plannedExerciseId records plan intent
performedExerciseId records actual execution
substitution changes performed identity without replacing planned identity
sets are attributed to the exercise actually performed
```

### Stable queue key

```text
dayId:index:plannedExerciseId
```

Queue construction (`buildSessionQueue` in `sessionQueue.js`) emits one entry per planned slot:

```text
slotKey
plannedExerciseId
performedExerciseId
```

Substitution updates only `performedExerciseId` (via log `skipped.substituteId` resolution). It does **not** replace planned identity and does **not** deduplicate slots by `exerciseId` or `substituteId`.

### Verified repeated-exercise behavior

```text
Two identical planned exercise slots remain two slots.

If Slot A is substituted with the same exercise already planned in Slot B,
both slots remain present with distinct slot keys.
```

Example: Slot A planned Cable lateral raise + Slot B planned Cable lateral raise → both slots preserved.

Example: Slot A planned Bench press, Slot B planned Decline press; Slot A substitutes to Decline press → two decline-press slots remain independent.

---

## Partial-set substitution rule

**Product rule (chosen and verified):**

```text
Substitution is allowed after completed sets.
```

**Verified attribution example:**

```text
Barbell bench press:
2 completed sets remain attributed to c_bench

Decline chest press machine:
3 later sets are attributed to c_decmc
```

```text
Completed sets are never moved from the original exercise to the substitute.
```

### Downstream behavior (verified)

| Surface | Behavior |
| --- | --- |
| **Summary** | Original and substitute appear as separate rows |
| **Stats** | Performance-only; each `exId` counted independently |
| **Progression** | Each performed exercise resolved independently |
| **Coach metrics** | Iterates actual exercise logs |
| **Session totals** | Coherent (e.g. `14/14` when all sets completed) |
| **Navigation** | Next/back preserves substitute in active slot |
| **Reload** | Restores substitute from `S.logs`; no duplicate queue entries |

---

## Invalid-data behavior (verified)

| Case | Behavior |
| --- | --- |
| Missing or invalid substitute | No log created under a missing ID |
| Existing original sets | Remain intact |
| Same-as-planned selection | No pseudo-substitution attribution |
| Unresolvable substituted slot | Session advances to next valid slot |
| Reload | No duplicate queue entries |

---

## Product gate — PASS

- Selected substitute state: visible accent border/background plus checkmark; `aria-pressed` reflects selection.
- Partial completion: `Replace remaining sets · {exercise}` and `Confirm replacement` avoid implying completed sets are discarded.
- Focus: `Switched from {planned}` preserves planned-versus-performed context.
- Summary: partial planned exercises use `Replaced`; the performed substitute stays a separate row.
- Mobile: 393×852 smoke passed with no horizontal overflow.

### Stats decision

**Stats remains performance-only.** Substitution relationship is explained in Summary, not repeated in Stats, unless future user testing proves otherwise.

```text
Barbell bench press: 2 sets
Decline chest press machine: 3 sets
```

---

## Implementation anchors

| File | Role |
| --- | --- |
| `src/lib/sessionQueue.js` | Stable slot queue; `plannedExerciseId` / `performedExerciseId` |
| `src/lib/session.js` | Substitution transition; set logs |
| `src/lib/components/SkipModal.svelte` | Substitute selection and confirm |
| `src/lib/components/FocusSession.svelte` | Focus current exercise |
| `src/lib/components/SummaryView.svelte` | Planned/performed Summary rows |
| `src/lib/stats.js` | Performance-only stats |
| `src/lib/progression.js` | Progression attribution |
| `src/lib/coachMetrics.js` | Coach volume from actual logs |
| `src/app.css` | `.skip-alt.active` — product P0 blocker |

---

## Test and verification evidence

### Focused behavioral tests (automated)

```bash
cd apps/fitness
npx playwright test tests/session-queue.spec.js tests/substitution.spec.js --reporter=line
```

**Result:** `8 passed` (2026-07-11)

Coverage includes: duplicate slots, slot identity, substitute Focus slot, partial sets, reload, navigation, Summary, Stats.

### Build and check gates

```bash
npm run check    # PASS — 0 errors; 8 pre-existing unrelated warnings
npm run build    # PASS
git diff --check -- apps/fitness   # PASS
```

### Merge-base reference

```text
b3128ac54174d660973f320937c2192e9303d2dc
```

### Evidence type distinction

| Evidence | Type | Scope |
| --- | --- | --- |
| `session-queue.spec.js` · `substitution.spec.js` | **Automated behavioral** | State model, attribution, persistence |
| `tests/substitution.spec.js` | **Automated product flow** | Selected state, `aria-pressed`, replacement copy, Focus, Summary, attribution |
| `docs/qa/evidence/gyms-sub-5/` | **Visual product evidence** | Selected state, partial replacement, Focus relationship, Summary `Replaced` |
| 393×852 live smoke | **Mobile runtime** | Replacement flow with no horizontal overflow |

Product gate accepted from automated flow, visual evidence, and the 393×852 live replacement smoke.

---

## Baseline failures (pre-existing · not GYMS.SUB.5)

These were observed during the verification window and are **not** GYMS.SUB.5 regressions:

| Command / suite | Failure |
| --- | --- |
| `plates.spec.js` | `join is not defined` |
| `test:sync` | Stale `createAuthSyncHandler` expectation; baseline uses `createLifeOsAuth` |
| `check:data` | Standalone Node cannot resolve unchanged `$lib` import |
| `test:supabase` | Remote permission denied for `has_app_access` |

Do not mark these fixed as part of GYMS.SUB.5 closure.

---

## Phase boundaries

### GYMS.SUB.5 engineering (this section) — PASS

- Planned/performed slot model
- Focus substitution execution
- Set attribution and downstream surfaces
- Queue identity and persistence
- Focused test suite green

### GYMS.SUB.5 product closure — PASS

Product gate accepted: visible selected state, `aria-pressed`, replacement terminology, Focus relationship label, Summary `Replaced`, mobile smoke, and visual evidence are complete.

### Out of scope

- Broader Fitness redesign
- Stats relationship duplication
- New schema or Supabase changes for substitution

---

## Related docs

| Document | Role |
| --- | --- |
| [`FT-P5-ui-closure-guide.md`](./FT-P5-ui-closure-guide.md) | UI/copy closure playbook · schemes · next actions |
| [`docs/roadmap/apps/fitness.md`](../../../docs/roadmap/apps/fitness.md) | Fitness roadmap hub |
| [`docs/LIFEOS_ROADMAP.md`](../../../docs/LIFEOS_ROADMAP.md) | Monorepo Now / Next |
| [`docs/qa/README.md`](../../../docs/qa/README.md) | QA doc index |
