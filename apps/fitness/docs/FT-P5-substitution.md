# Fitness GYMS.SUB.5 — Substitution Flow (Canonical)

**Verification date:** 2026-07-11 · **Closure verified:** 2026-07-13
**Section:** GYMS.SUB.5 state model · engineering gate · product review
**Overall release readiness:** **PASS (shipped)** — UI/copy closure landed in #19 `67e72b81`; all automated gates green.

> **Closed 2026-07-13.** The P0 blocker (substitute selected state imperceptible) and P1 copy items were implemented in #19 (`.skip-alt.active` accent bg + border + inset shadow + checkmark, `aria-pressed`, `done`-branched title/confirm copy, Summary `Replaced` badge, Focus `Switched from` label). Verified: `session-queue.spec.js` + `substitution.spec.js` **9/9 green** (incl. selection-state + copy assertions).

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
| Product understandability | **PASS** | Selected state now accent bg + border + checkmark + `aria-pressed` (#19) |
| **GYMS.SUB.5 overall** | **PASS** | UI/copy closure shipped in #19; specs 9/9 green (2026-07-13) |

```text
GYMS.SUB.5 engineering gate: PASS
GYMS.SUB.5 product gate: PASS (closure #19; specs 9/9)
GYMS.SUB.5 overall release readiness: PASS — shipped
```

---

## Executive summary

GYMS.SUB.5 replaces the old skip-only bookkeeping with a stable **planned slot / performed exercise** model. Substitution changes which exercise is performed in a slot without collapsing slot identity or moving completed sets.

**Engineering is complete and verified** by focused Playwright tests and build/check gates.

**Product release closure shipped in #19 (`67e72b81`, 2026-07-13 verified):** the previously-blocking UI/copy items are all implemented and test-covered — see [`FT-P5-ui-closure-guide.md`](./FT-P5-ui-closure-guide.md).

1. ✅ Visible substitute selected state (P0) — accent background + border + inset shadow + checkmark + `aria-pressed` (`SkipModal.svelte`, `app.css`)
2. ✅ Partial-completion modal terminology (P1) — `done`-branched `replaceRemainingTitle` / `confirmReplacement`
3. ✅ Summary “Replaced” terminology (P1) — `SummaryView.svelte` `replaced` badge
4. ✅ Lightweight Focus relationship label (P2) — “Switched from …” (`FocusSession.svelte`)
5. ✅ Automated closure verified — `substitution.spec.js` asserts selection state + copy; 9/9 green

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

## Product gate — BLOCKED

### P0: Substitute selected state is visually imperceptible

The substitute option’s selected state appears effectively identical to its unselected state.

**Observed computed styles (manual / static review):**

```text
Unselected:
border: rgb(48, 48, 50)
background: rgb(32, 32, 34)
text: rgb(242, 242, 242)

Selected:
border: rgb(48, 48, 50)
background: rgb(32, 32, 34)
text: rgb(242, 242, 242)
```

**Likely implementation causes:**

- Weak `.skip-alt.active` treatment in `app.css`
- No background tint on selected state
- Later `.skip-alt` rules may override active color
- No secondary non-color selected indicator (checkmark, icon)
- Missing `aria-pressed` or equivalent accessible selected semantics

**Minimum expected fix (documented only — not implemented in this section):**

```text
Add a clearly differentiated selected background and border.
Add a checkmark or equivalent selected indicator.
Expose selection semantics with aria-pressed or the appropriate
accessible selected-state property.
```

Reference pattern: `.skip-reason.active` visual language (`background: var(--accent-bg); border-color: var(--accent); color: var(--accent);`) — accent color need not be orange.

---

## Product follow-up (local UI/copy — not state-model changes)

### P1: Partial-completion modal terminology

**Current (problematic when `log.done > 0`):**

```text
Skip · Barbell bench press
Confirm skip
```

Implies completed sets may be voided.

**Recommended rule:**

| State | Modal title | Confirm |
| --- | --- | --- |
| 0 sets completed | `Skip · {exercise}` | `Confirm skip` |
| Partial sets completed | `Replace remaining sets · {exercise}` | `Confirm replacement` |
| All sets completed | No substitute entry | — |

### P1: Summary terminology

**Current (problematic):**

```text
Barbell bench press
Skipped · 2/4 sets
```

**Recommended:**

```text
Barbell bench press
Replaced after 2 sets · 2/4
```

Substitute remains a separate row:

```text
Decline chest press machine
3/3 sets
```

Badge rule: **0 original sets** → `Skipped`; **partial original sets + substitute** → `Replaced`.

### P2: Focus transition context (optional)

Lightweight label after substitution — not a large banner:

```text
Switched from Barbell bench press
```

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
| `.skip-alt.active` computed styles | **Static / manual review** | Selected-state visibility (P0 blocker) |
| Modal / Summary copy | **Static / manual review** | Terminology follow-ups (P1) |

No claim of a full live end-to-end product review on device; product gate findings combine implementation inspection with automated flow evidence.

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

### GYMS.SUB.5 product closure — BLOCKED

See **[`FT-P5-ui-closure-guide.md`](./FT-P5-ui-closure-guide.md)** for research, three schemes, recommended **Scheme 1**, PR split, verification checklist, and optional A/B plan.

- P0 selected-state visibility (`app.css` + `aria-pressed` + checkmark)
- P1 modal and Summary copy (Replace vs Skip by `done`)
- P2 optional Focus label
- Targeted product re-review after UI fixes

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
