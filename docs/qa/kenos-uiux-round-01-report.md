# Kenos UIUX Round 01 — System Baseline Improved

**Stamp:** KENOS UIUX ROUND 1 — SYSTEM_BASELINE_IMPROVED  
**SHA (start):** `435f12e0efefd1027cb7efeb94cfa36a9b6978a6`

## Baseline finding

First contact sheets captured **Auth wall only** because preview build had `VITE_AIOS_CLOUD=1` semantics. Rebuilt local preview with `VITE_AIOS_CLOUD=0` and added `seedKind: 'kenos'` so screenshots show real shell (honest Auth wall still documented as before evidence).

## Scorecard (post-fix)

| Category | Score / weight |
|---|---|
| Information architecture | 12/15 |
| Navigation and orientation | 11/15 |
| Platform nativeness | 9/12 |
| Visual hierarchy | 7/10 |
| Cross-app continuity | 7/10 |
| Domain identity | 7/8 |
| Reuse / compounding | 7/8 |
| State clarity | 6/8 |
| Accessibility | 6/8 |
| Responsive | 3/4 |
| Motion / feedback | 1/2 |
| **Total** | **76/100** |

Baseline (auth-wall-only) effective score for shell visibility: **38/100**.

## P0 / P1 fixed

| Sev | Issue | Fix | Shared asset |
|---|---|---|---|
| P0 | Screenshots blocked by cloud auth wall | Local non-cloud rebuild + kenos seed | `seedKind: 'kenos'` in uiux-review |
| P1 | Spaces page card stack / cheap containers | Grouped list rows, `--content-max` | Spaces page pattern |
| P1 | Unavailable treated as critical red | ReadSourceState: unavailable/unsupported → warning | ReadSourceState |
| P1 | uiux aios pages still chat-at-`/` | Today/Assistant/Spaces/Inbox matrix | uiux-review.config |

## P2 (selected)

- Page title scale slightly reduced on Spaces
- Content width aligned to `--content-max`

## Evidence

- `output/uiux/kenos-compounding-2026-07-20/round-00-baseline/before/auth-wall-*.png`
- `docs/ui-qa-screenshots/aios/uiux-review/latest/aios-uiux-review-light-desktop.png`

## Independent critique disposition

Deferred to Round 2–3 once Space Switcher landed (see Round 03).
