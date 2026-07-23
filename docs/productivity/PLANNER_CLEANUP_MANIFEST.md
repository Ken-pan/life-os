# Planner Test-Task Cleanup Manifest (read-only provenance audit)

> Generated read-only 2026-07-22. **Nothing was archived or deleted.** Classification is by
> provenance (machine-generated ID prefix + `via_kenos_rpc` + `list_id` + title signature),
> NOT by title keyword alone — two look-alike tasks are real and are explicitly excluded.
> Owner confirms → then archive (soft, reversible) under a G2 authorization.

## Scope

Owner's live Planner: **998 non-deleted tasks**. Buckets:
- `HUMAN_OR_UNMARKED` 925 — real (870 completed). KEEP.
- `AGENT_OTHER` 49 — **false positives**: real recurring tasks that went through the Kenos command RPC (Sapphire Card 账单, 健身 · 背/胸/腿/臂, 拖地/洗碗/清理…). KEEP.
- `TEST_TITLE` 21 → **19 harness garbage** + **2 real roadmap tasks** (excluded).
- `SPINE_DOGFOOD` 3 — separate review (see DOGFOOD_ROW_REVIEW_PACKET.md).

## TIER 1 — Archive candidates (harness-generated E2E artifacts, high confidence)

All have machine IDs, timestamp-suffixed titles, `via_kenos_rpc=false`, `list_id=null` (loose in the pool). Reversible cleanup = soft-delete (set `data.deletedAt`, 30-day tombstone) or `kenos_archive_plan_task_action`.

### Incomplete (15) — these clutter the live task pool
| id | title |
|---|---|
| kenos-cont-mrtmk5oj | Continuity Planner Test 0T19-35-44-322Z |
| kenos-cont-mrtnc5qt | Continuity Planner Test 0T19-57-30-773Z |
| kenos-cont-mrtncxuj | Continuity Planner Test 0T19-58-07-194Z |
| kenos-cont-mrtxgbhv | Continuity Planner Test 1T00-40-41-010Z |
| kenos-cont-mrtxhnia | Continuity Planner Test 1T00-41-43-233Z |
| ios-fa-mru7ehfc | FA Seed 9-094Z |
| ios-ab-mruxbc01 | iOS FlowA MUT 24-31-160Z |
| ios-ab-mruxsc1h | iOS FlowA MUT 37-44-769Z |
| ios-ab-mru6h2xc | iOS FlowA MUT 50-27-685Z |
| ios-ab-mru6ih4a | iOS FlowA MUT 54-14-534Z |
| ios-ab-mru4u81v | iOS FlowA Seed 4-07-23-962Z |
| ios-ab-mrux1lhl | iOS FlowA Seed 7-16-57-130Z |
| ios-ab-mrux340c | iOS FlowA Seed 7-18-08-124Z |
| ios-ab-mrux7gjc | iOS FlowA Seed 7-21-29-974Z |
| ios-ab-mrux8um3 | iOS FlowA Seed 7-22-35-964Z |

### Completed (4) — not polluting active views; archive for tidiness only
| id | title |
|---|---|
| kenos-continuity-plan-001 | Continuity Planner Test |
| kenos-cont-mrtml2wn | Continuity Planner Test 0T19-36-27-382Z |
| kenos-cont-mrtmua79 | Continuity Planner Test 0T19-43-36-741Z |
| kenos-continuity-plan--07-20T19-35-04-254Z | Continuity Planner Test 9-35-04-254Z |

## EXCLUDED — real tasks that merely look like tests (DO NOT touch)

| id | title | why keep |
|---|---|---|
| roadmap-h-p10 | H-P10 · /plan smoke 扩面 | `roadmap-` id, `list_id=inbox`, created 2026-07-09 — a real roadmap item about expanding /plan smoke coverage, not a harness artifact |
| roadmap-p-move-verify | P-MOVE-VERIFY · 设备生产 Paper 数据面 E2E | `roadmap-` id, `list_id=inbox`, completed — a real milestone task |

## SEPARATE — Spine dogfood (3, REVIEW per prior packet, not part of this cleanup)

`Spine 验收…`, `Ingram Search: 整理…`, `Photo Organizor: 跑一轮…` — legitimate next-actions; keep unless you don't want the 3 projects onboarded.

## Recommended action (requires Owner confirmation + G2 authorization)

Archive **Tier 1 incomplete (15)** first — these are the ones polluting your daily view. Optionally
also archive the **4 completed**. All are soft-deletes (reversible within the 30-day tombstone).
`roadmap-*` and the 3 dogfood tasks are untouched. This audit performed **no** mutation; say the word
and I'll prepare the exact reversible archive batch (gated by `npm run prod:authorize`).
