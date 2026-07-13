# PaperOS UI Correction Slice 1.1 — Evaluation Report

This report evaluates and corrects previous UI assumptions against the actual candidate worktree (`feat/p-move-ui-core-slice-1`, commit `fdfc3f3f`) located at `/Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1`. 

---

## 1. Corrected Current-State Summary

The evaluated candidate worktree (`feat/p-move-ui-core-slice-1` up to commit `fdfc3f3f`) reveals a completed implementation of Core Slice 1 and Slice 1.1 visual cleanup:
* **Temporary SystemDrawer Already Exists**: A dedicated [SystemDrawer.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/SystemDrawer.qml) is implemented. It functions as a slide-out overlay (width 460px, ~48% width) triggered by the hamburger icon in [Main.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/Main.qml).
* **No Permanent Bottom Navigation**: The old bottom tab bar (`Home / Today / Write / ···`) has been removed. Primary navigation is driven via the `SystemDrawer` and context headers.
* **Note Editor State Machine is Active**: [InkModeController.cpp](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/src/InkModeController.cpp) implements Chrome States (`Chrome::Clean` and `Chrome::Revealed`). The overlay `nativeInkCover` handles touch routing, while the native ink system captures evdev pen strokes.
* **Auto-Retreat is Shipped**: Chrome (toolbar and headers) automatically hides approximately 1.5 seconds after a stroke finishes via `scheduleWritingRetreat()`. It reveals again upon tapping the top-left "Tools" handle.
* **Tool/Color Visual-State Consistency Resolved**: The tool/color state synchronization bug on the physical device has been successfully resolved (commit `52ae55e0`). Changes to pen presets or colors now correctly trigger direct-framebuffer updates and sync cleanly with the input pipeline on session recovery/retreat.
* **Legacy Destinations Retained**: Destinations like `Inbox`, `Review`, and `Settings` (as `SystemPage`) are temporarily kept in the drawer to keep modules working until Slice 2.
* **Out of Scope**: Multi-page data structures, Page Overview grids, search overlays, templates, and finalizing the Home/Today IA (removing transitional duplicate destinations in the drawer) remain deferred to Slice 2 or future epics.

---

## 2. Recommended Native Editor Changes (Max 6)
*These changes target the C++ direct-framebuffer renderer in [InkModeController.cpp](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/src/InkModeController.cpp).*

1. **Vector Icons for Pen/Eraser Tools [P0]**  
   Replace the plain text labels (`P1`/`P2`/`Erase` or `Pen 1`/`Pen 2`/`Eraser`) in `InkModeController::drawToolbar()` with minimal outline pen nibs and eraser vector shapes drawn via `QPainter`.
2. **Replace Left Rail with Compact Contextual Tool Rail [P0]**  
   Replace the legacy full-height left tool rail with a minimal, contextual rail (72-84px width, no drop shadow, max 1px Ink30 border or none). When collapsed, it should only show the current tool, Undo, and an expand handle, retreating automatically 1-1.5s after writing rather than acting as a permanent consumer-electronics capsule.
3. **Lighter Editor Header Bar [P1]**  
   Refine `drawToolbar()` to simplify the layout of the back button and the note title, removing hard black separating lines to maximize writing space.
4. **Instant Discrete Pressed Feedback [P1]**  
   Provide immediate, discrete black-and-white inverse visual feedback when tapping a native control zone before swapping buffer frames.
5. **Polished "Tools" Handle [P2]**  
   Replace the raw text "Tools" box drawn in `paintHandle()` with a clean, minimal vector handle icon to make the collapsed state less intrusive.

---

## 3. Recommended QML Visual Changes (Max 6)
*These changes target the QML Shell, System Drawer, and Notes Gallery in `qml/`.*

1. **System Drawer Linear Icons [P0]**  
   Integrate uniform, linear SVG icons alongside the navigation list items (`Today`, `Notes`, `Tasks`, `Documents`, `Settings`) in [SystemDrawer.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/SystemDrawer.qml).
2. **Remove Gallery Card/Thumbnail Border Frames [P1]**  
   Remove `border.width: 1` and `border.color: Ui.ink30` from `continuePreview` and `recentPreview` in [HomeTodayPage.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/HomeTodayPage.qml) to let paper thumbnails float as borderless paper objects.
3. **Linear Header Action Icons [P1]**  
   Redesign the contextual `notes.new` button in [Main.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/Main.qml) into a thin, borderless linear plus icon, rather than the heavy black block or standard text `+`.
4. **Standardize Action Touch Targets [P1]**  
   Ensure all QML header and drawer interaction targets (e.g., menu button, navigation actions, add note) maintain an active hit area of at least 72x72px. Use a large parent `Item` with a centered `Icon` and a passive-grabbing `TapHandler`, rather than applying negative margins to a `MouseArea`.
5. **Fine Category Tab Underlines [P2]**  
   Change the category tab selector underlines in [NotesPage.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/NotesPage.qml) from a 4px line to a lighter 2px underline indicator.
6. **Grayscale Token Alignment [P2]**  
   Replace ad-hoc colors (e.g. `#EEEEEE` used for row selections in [HomeTodayPage.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/HomeTodayPage.qml) and [TodayPage.qml](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/TodayPage.qml)) with standard injected tokens (`Ui.ink100`, `Ui.ink70`, `Ui.ink30`, `Ui.paper`).

---

## 4. Items Explicitly Deferred

### Core Slice 2 IA (Information Architecture)
* **Drawer IA Refactor**: Remove legacy destinations (`Inbox`, `Review`) and rename `System` to `Settings`.
* **Finalize Home/Today IA**: Remove transitional duplicate destinations in the drawer. While the unified `HomeTodayPage.qml` handles the landing view, routing nomenclature and drawer slot consolidation (e.g. `Today`, `Notes`, `Tasks`, `Documents`, `Settings`) must be finalized.
* **Sync Indicators Policy**: Hide healthy sync logs from the dashboard footer; show banner alerts only on offline or sync errors.

### Future Epics
* **Multi-Page Storage**: Complete JSONL journal format and atomic directory/manifest sync.
* **Page Overview**: Grid-style thumbnail layout for notebook pages with selection modes.
* **New Note Templates**: A template selection interface showing Blank, Ruled, and Dotted layouts.
* **Global and In-Notebook Search**: Handwriting and text index integration.
* **Quick Switcher / Control Center**: Swipe-activated system overlays.
* **Gallery Multi-Select**: Long-press activation for batch Move/Delete/Favorite.

---

## 5. Inspected Files & Candidate Commit

The following files were inspected inside the `/Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1` worktree:

* **Commit**: `fdfc3f3f` (Branch: `feat/p-move-ui-core-slice-1`)
* **Files**:
  1. [`apps/planner-device/remarkable-lite/qml/Main.qml`](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/Main.qml)
  2. [`apps/planner-device/remarkable-lite/qml/SystemDrawer.qml`](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/SystemDrawer.qml)
  3. [`apps/planner-device/remarkable-lite/qml/HomeTodayPage.qml`](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/HomeTodayPage.qml)
  4. [`apps/planner-device/remarkable-lite/qml/NotesPage.qml`](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/qml/NotesPage.qml)
  5. [`apps/planner-device/remarkable-lite/src/InkModeController.cpp`](file:///Users/kenpan/「Projects」/life-os/.claude/worktrees/p-move-ui-slice1/apps/planner-device/remarkable-lite/src/InkModeController.cpp)
  6. [`docs/qa/paperos-core-slice-1-integration-gate.md`](file:///Users/kenpan/「Projects」/life-os/docs/qa/paperos-core-slice-1-integration-gate.md)
  7. [`docs/qa/paperos-core-slice-1-visual-gate.md`](file:///Users/kenpan/「Projects」/life-os/docs/qa/paperos-core-slice-1-visual-gate.md)
  8. [`docs/qa/paperos-eink-uiux-gap-audit.md`](file:///Users/kenpan/「Projects」/life-os/docs/qa/paperos-eink-uiux-gap-audit.md)

---

## 6. Confirmation of Code Preservation

**No code was modified in the worktree or repository root during this evaluation.**

---

## 7. Rejections
* **Reject changing global Paper color**: The proposal to shift the background color from `#FFFFFF` to `#F7F7F2` is rejected. Off-white fills on e-ink cause visible dithering, decrease contrast for handwriting, and incur unnecessary frame-refresh overhead. Pure `#FFFFFF` paper background is retained.
