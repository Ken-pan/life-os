# Planner Schedule UI/UX Baseline Report (PLNR.SCHED.0)

**Date**: 2026-07-10
**Agent**: Antigravity (Browser QA Baseline)
**Target**: Planner Calendar & Today Scheduling
**Viewports**: Desktop (1440x960), Mobile PWA (393x852)

## 1. Revised Baseline Verdict

The core Calendar and Today scheduling features **successfully render and function** when provided with canonical, fully-formed task data. The previous failure (the `task.tags is not iterable` crash) was confirmed to be a combination of a test harness defect (omitted defaults in the injected fixture) and a data-normalization robustness issue on the frontend.

When tested with canonical tasks (Scenario A), overlapping layouts function, and drag-and-drop actions fire and persist cleanly. The application requires a hardening fix for legacy data (Scenario B) that lacks the `tags` array.

## 2. Top Findings & Usability Blockers

1. **Malformed Data Robustness (P0)**: Legacy tasks missing the `tags` array cause a total app crash (`task.tags is not iterable`). **Root cause:** `migrateTask()` in `apps/planner/src/lib/persist/migrate.js` spreads `...t` without defaulting `tags: []`; consumers (`taskIndex.js`, `filters.js`, etc.) iterate `task.tags` directly. Fix: normalize in `migrateTask` or guard at read sites.
2. **Mobile Scroll Container (P1 · 待 PWA 复测)**: Antigravity baseline 在 **未**设置 `html.standalone-pwa` 的 Playwright mobile viewport 上采集到 `overflowY: visible`。`packages/theme/src/scroll-shell.css` 已在 `standalone-pwa` 下为 `.life-os-page-workspace` 配置 `overflow-y: auto`。**不能**直接等同真实 iOS PWA 缺陷 — 需 `npm run qa:pwa` 或 Simulator 复测（**PLNR.SCHED.10.pwa** / Ken **`PLNR.SCHED.10b.ios`**）。
3. **Missing `sparseHint` for Empty Days (P2)**: Empty days in the Calendar view do not display a clear call-to-action or sparse hint, leaving the UI looking empty.
4. **Environment Noise**: `501 Not Implemented` for `/api/ai/plan` on load (recorded as environment noise; does not block scheduling interactions).

## 3. Canonical vs. Malformed Fixture Result

We split the baseline into two explicit scenarios to isolate the root cause:
*   **Scenario A (Canonical Task)**: Fixtures seeded with all required schema defaults (including `tags: []`). **Result:** Passed. Overlapping events rendered correctly, and the timeline was interactable.
*   **Scenario B (Legacy/Malformed Task)**: Fixtures seeded intentionally missing `tags`. **Result:** Failed. Immediately triggered the `task.tags is not iterable` crash, proving the UI lacks safe-access (`?.`) or normalization for legacy task shapes.

## 4. Drag/Scroll Metrics & Unblocked Scenarios

With the canonical fixtures unblocking the UI, the following scenarios successfully executed:
*   **Desktop**: Create, drag, resize, reload persistence. The drag-and-drop simulation correctly moved the time block and persisted across a page reload.
*   **Mobile**: Bounding box metrics were captured during a touch drag simulation.
    *   `scrollTop`: 0
    *   `scrollHeight`: 1300
    *   `clientHeight`: 1300
    *   `overflowY`: "visible"
    *   **Conclusion**: The `.life-os-page-workspace` or `main` container is **not** the primary scroller. It is overflowing visibly, meaning the window/body is handling the scroll, violating standard PWA locked-viewport principles.

## 5. Evidence Matrix

| ID | Scenario | Severity | Viewport | Steps to Reproduce | Expected Behavior | Actual Behavior | Suspected Area |
|---|---|---|---|---|---|---|---|
| **QA-001** | B (Malformed) | P0 | Desktop | Open calendar with malformed task (missing tags) | App handles missing tags gracefully | App crashes (`tags is not iterable`) | Data Normalization |
| **QA-002** | A (Canonical) | P2 | Desktop | Open calendar on an empty day | Should show sparseHint | Blank state | Calendar Context |
| **QA-003** | A (Canonical) | P0 | Desktop | Open calendar with normal events | Events shown without overlap | Rendered successfully | DayTimeline |
| **QA-004** | A (Canonical) | P1 | Desktop | Drag time block down, reload page | Block moves and persists new time | Verified via screenshot | DayTimeline Drag & Drop |
| **QA-005** | A (Canonical) | P0 | Desktop | Open calendar with 2 overlapping events | Events shown side by side | Rendered successfully | overlappingTaskIds |
| **QA-006** | A (Canonical) | P1 | Desktop | Open calendar with 3 overlapping events | Events shown side by side | Rendered successfully | overlappingTaskIds |
| **QA-007** | B (Malformed) | P0 | Mobile | Open calendar with malformed task (missing tags) | App handles missing tags gracefully | App crashes | Data Normalization |
| **QA-008** | A (Canonical) | P2 | Mobile | Open calendar on an empty day | Should show sparseHint | Blank state | Calendar Context |
| **QA-009** | A (Canonical) | P0 | Mobile | Open calendar with normal events | Events shown without overlap | Rendered successfully | DayTimeline |
| **QA-010** | A (Canonical) | P1 | Mobile | Simulate touch drag on mobile | Page scrolls/drags appropriately | Captured metrics showing overflow issue | Mobile Scroll |
| **QA-011** | A (Canonical) | P0 | Mobile | Open calendar with 2 overlapping events | Events shown side by side | Rendered successfully | overlappingTaskIds |
| **QA-012** | A (Canonical) | P1 | Mobile | Open calendar with 3 overlapping events | Events shown side by side | Rendered successfully | overlappingTaskIds |

## 6. Screenshot and Trace Paths

**Screenshots** (`docs/qa/evidence/planner-schedule/2026-07-10/`):
*   `ScenarioA-Desktop-01-calendar-empty.png`
*   `ScenarioA-Desktop-02-calendar-normal.png`
*   `ScenarioA-Desktop-03-drag-interaction.png`
*   `ScenarioA-Desktop-04-reload-persistence.png`
*   `ScenarioA-Desktop-06-calendar-2-overlap.png`
*   `ScenarioA-Desktop-07-calendar-3-overlap.png`
*   `ScenarioA-Mobile_393x852-01-calendar-empty.png`
*   `ScenarioA-Mobile_393x852-02-calendar-normal.png`
*   `ScenarioA-Mobile_393x852-05-scroll-interaction.png`
*   `ScenarioA-Mobile_393x852-06-calendar-2-overlap.png`
*   `ScenarioA-Mobile_393x852-07-calendar-3-overlap.png`
*   `ScenarioB-Desktop-legacy-crash.png`
*   `ScenarioB-Mobile_393x852-legacy-crash.png`

**Traces**:
*   `docs/qa/evidence/planner-schedule/2026-07-10/trace-Desktop.zip`
*   `docs/qa/evidence/planner-schedule/2026-07-10/trace-Mobile_393x852.zip`

*(You can open these in `https://trace.playwright.dev/` to inspect exact pointer sequences, network, and DOM snapshots.)*

## 7. Remaining Missing Scenarios

*   **Keyboard/Viewport behavior when creating a block**: Not fully captured; testing visual keyboard popovers requires either native device automation or specific Chrome CDP overrides that were out of scope for the headless PWA viewport script.

## 8. Files Modified

1.  `apps/planner/tests/antigravity-baseline.spec.js` (Updated to use Scenario A / B factories)
2.  `docs/qa/evidence/planner-schedule/2026-07-10/*` (Updated screenshots + traces)
3.  `docs/qa/planner-schedule-antigravity-baseline.json` (Updated JSON extraction)
4.  `docs/qa/planner-schedule-antigravity-baseline.md` (This report)

## 9. Simulated Standalone CSS Gate (PLNR.SCHED.10a.sim)

FINAL VERDICT:
PASS simulated standalone CSS gate

BASE_SHA: c4eb544824d76aca81072bdb78a8a7b88cec4086
Routes tested: /today, /calendar, /settings
Viewport: 390x664 (iPhone 13 simulated, Mobile Safari userAgent)
Standalone class injected: YES

Per-route measurements:
- /today: Standalone class injected successfully. Main shell scroll container not present on this route layout.
- /calendar: overflowY: auto, clientHeight: 560, scrollHeight: 1181, initialScrollTop: 0, finalScrollTop: 621, canReachEnd: true, tabBarObscures: false.
- /settings: overflowY: auto, clientHeight: 595, scrollHeight: 1742, initialScrollTop: 0, finalScrollTop: 1147, canReachEnd: true, tabBarObscures: false.

Artifacts:
Screenshots: output/playwright/sch-10-planner/ (top-*.png, bottom-*.png)
Report JSON: output/playwright/sch-10-planner/report.json
Markdown evidence: docs/qa/planner-schedule-antigravity-baseline.md

Code or CSS changed: NO
Real iOS device tested: NO
PLNR.SCHED.10.pwa closed: NO

Observed blockers: None for standalone scroll behavior simulation.
Recommended handoff to Cursor: Cursor or owner can proceed with real iOS device/simulator verification (PLNR.SCHED.10b.ios) to fully close PLNR.SCHED.10.pwa.
