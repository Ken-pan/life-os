# Screenshot Strict Audit — P5 Knife 2/3 + Continuity canonical

**Date:** 2026-07-20  
**Auditor method:** human criteria + pixel geometry + manifest probes + image review  
**Owner Review:** NOT OPEN · Visual Quality: IN_PROGRESS

## Scope

| Corpus | Role |
| ------ | ---- |
| `p5-knife2-sheet-hierarchy/r2-*` + `r2b-*` + `manifest-r2.json` | Knife 2 **CANONICAL** |
| `p5-knife2-sheet-hierarchy/01-*`…`04-*` + `02-open-*` + `before-round2/` + `manifest.json` | Knife 2 **SUPERSEDED** |
| `p5-knife3-ipad-material/open-*` + `manifest.json` | Knife 3 **CANONICAL** |
| `continuity-e2e-2026-07-20T20-12-22-998Z` | Continuity **functional** canonical (not Knife 2/3 visual truth) |

## Verdict

| Gate | Result |
| ---- | ------ |
| Knife 2 mobile bottom sheet (390) | **PASS** |
| Knife 2 tablet form (768) | **PASS** |
| Knife 2 desktop anchored Direction A | **PASS** (prefer `r2b-open-1440x900` over early `r2-02-open-1440x900`) |
| Knife 2 superseded centered desktop isolated | **PASS** (clearly marked; geometry center ≠ anchored) |
| Knife 3 touch≥900 → tablet-lg form | **PASS** (`open-1024x768-touch`, width≈640) |
| Knife 3 fine≥900 → desktop anchored | **PASS** (`open-1024x768-fine`, width≈440, not centered-command) |
| Knife 2/3 interaction matrix (close/esc/scrim/focus) | **PASS** (manifest: 0 sheetGone failures) |
| Continuity functional canonical bindings | **PASS** (23/23 files present; SHA match; prior footnotes cleared) |
| Mix Continuity E2E frames as Knife 2/3 visual proof | **FAIL if done** — Continuity A05 still shows pre–Knife2 All Spaces UI |

**Overall screenshot audit:** **PASS WITH FOOTNOTES** (not Visual Quality PASS; not Owner Review).

**Footnote remediation (code, 2026-07-20):** P1–P3 addressed in Continue overlay (anchor chrome clamp, All Spaces catalog count, hairline list). P4–P5 remain documentation / corpus hygiene.

**Post-fix evidence:** `p5-footnote-fix-2026-07-20/` — capture **PASS**  
(`All Spaces · 8`; desktop `1440`/`1024-fine` left=248, clearance=8px; list outer border 0).

## Geometry spot checks (2× deviceScale)

| Frame | panel left ratio | width ratio | Notes |
| ----- | ---------------- | ----------- | ----- |
| K2 `r2-02-open-390x844` | 0.003 | 0.97 | Full-width bottom sheet |
| K2 `r2-02-open-768x1024` | 0.18 | 0.68 | Centered form |
| K2 `r2-02-open-1440x900` | 0.03 | 0.28 | Anchored left; **tight to chrome** |
| K2 `r2b-open-1440x900` | 0.10 | 0.31 | Anchored **clear of sidebar** — preferred desktop proof |
| K2 `02-open-1440x900` SUPERSEDED | 0.41 | 0.25 | True center command panel |
| K3 `open-1024x768-touch` | 0.27 | 0.52 | Form sheet |
| K3 `open-1024x768-fine` | 0.25 | 0.32 | Narrower anchored (~440 CSS px) |

## Continuity canonical (`…T20-12-22-998Z`)

- `SCREENSHOT_STRICT_AUDIT.md`: prior B02/B08/C03/watermark footnotes **cleared**
- `validation-results.json`: `canonical: true`, `blockers: []`, stamps VALIDATED / Gate PASSED
- 23 screenshot bindings: files on disk, SHA-256 match
- Watermark: A05 top bar dark + run id visible
- **Do not** cite Continuity A05/B04 as Knife 2 “All Spaces · N” proof — those frames predate Knife 2 UI (still show `展开` + Today row)

## Footnotes → annotated problems (2026-07-20 fix pass)

| ID | Problem | Modern solution researched | Fix |
| -- | ------- | -------------------------- | --- |
| **P1** | Desktop `r2-02` panel hugs left chrome (~3% left); weak sidebar clearance when trigger rect / clamp is soft | CSS Anchor Positioning (`position-anchor` / `position-try` flip) + Floating UI flip/shift model ([web.dev](https://web.dev/learn/css/anchor-positioning)); JS fallback until multi-trigger portal is anchor-stable | `continueOverlayAnchor.core.js`: prefer right-of-trigger, flip-inline, **clamp `left ≥ chromeLeft + gap`** via measured sidebar / `--sidebar-w` |
| **P2** | Demo frames show `All Spaces · 2` — count was **remainder after Recent/Pinned**, not catalog size (App Library honesty) | App Library / Applications: full catalog under “All”; Recents are shortcuts, not a subtractive set | `buildSpaceSwitcherSections`: All = full catalog; UI `allCount = SPACE_SWITCHER.catalog.length` |
| **P3** | List `border-top` + per-row `border-bottom` read as soft bordered **group card** under blur | Hairline **row separators only** (no outer box) — HIG-style lists | `.list` no outer border; `.item + .item` hairline only |
| **P4** | Continuity E2E A05 still shows pre–Knife2 All Spaces (`展开` + Today) | Do not mix corpora; optional later Continuity visual refresh (functional gate frozen) | **Docs only** — not a product regression |
| **P5** | Auto-vision mislabels fine anchored panels as “centered” | Trust geometry + `layout-*` class + manifest probes | **Docs only** |

## Fix verification targets

- Unit: `continueOverlayAnchor.core.test.js`, `spaceSwitcher.core.test.js` (All Spaces catalog-complete)
- Visual: reopen Continue @1440 fine → panel left ≥ sidebar + 8px; All Spaces · N matches hosted catalog length (≥6)
- Continuity contracts / E2E testids: **untouched**


## Must not mix

```text
SUPERSEDED Knife2 early (01-/02-/centered)  ≠  Knife2 Direction A (r2-/r2b-)
Continuity E2E chrome (T20-12-22)           ≠  Knife2/3 visual truth
Knife3 touch form @1024                     ≠  Knife3 fine anchored @1024
```

## Residual → later knives

- Domain identity (Knife 4)
- Today type rhythm (Knife 5)
- Optional: refresh Continuity visual smoke after Knife 2/3 (functional gate already frozen — only if Owner wants visual parity in Continuity packets)
