# PaperOS E-Ink UI/UX Gap Audit

**Date:** 2026-07-10
**Status:** Baseline captured — ready for Antigravity review + Fable implementation
**Workstream:** **PAPR.UI**
**Execution SSOT:** [`paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md) (Slice 1.1 → 2 → deferred)
**Long-term brief:** [`paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md)
**Product north star:** _Paper canvas + contextual tools + temporary system surfaces_

---

## 1. Sources of truth

| Artifact | Path | Role |
| -------- | ---- | ---- |
| **Next UI update guide** (execution SSOT) | [`paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md) | Slice 1.1 / 2 / deferred; Design System v0.2; agent handoffs |
| **Agent execution brief** (long-term) | [`paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md) | Full P0 matrix; north star when slices complete |
| **Core Slice 1 gates** | [`paperos-core-slice-1-integration-gate.md`](./paperos-core-slice-1-integration-gate.md) · [`paperos-core-slice-1-visual-gate.md`](./paperos-core-slice-1-visual-gate.md) | Technical contract; Antigravity findings |
| **Reference mockups** (design direction)    | [`paperos/reference/2026-07-10/`](./paperos/reference/2026-07-10/) — see [README](./paperos/reference/2026-07-10/README.md)      | Target IA and chrome behavior — not pixel specs                     |
| **Device screenshot baseline** (2026-07-10) | `docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`                                                                     | On-device reality via `paperctl` (gitignored; canonical local path) |
| **Subsequent device captures**              | `docs/ui-qa-screenshots/paperos/device/latest/`                                                                                  | Rolling inventory for regression / Antigravity review               |
| **Legacy capture copy**                     | `output/paperos-move-screenshots/`                                                                                               | Same baseline as above; kept for session convenience                |
| **Shell MVP gate** (shipped baseline)       | [`../PRO_MOVE_SHELL_MVP_GATE.md`](../PRO_MOVE_SHELL_MVP_GATE.md)                                                                 | What PAPR.DEV.1–4 + shell modules delivered                           |
| **Technical gap report** (non-UI)           | [`../PRO_MOVE_STATUS_VS_IDEAL.md`](../PRO_MOVE_STATUS_VS_IDEAL.md)                                                               | Cache, launcher, sync, write path — complementary                   |
| **Device access**                           | [`../PRO_MOVE_DEVICE_ACCESS.md`](../PRO_MOVE_DEVICE_ACCESS.md)                                                                   | SSH, paths, wake-before-deploy                                      |
| **Test driver / screenshots**               | [`../../apps/planner-device/remarkable-lite/docs/test-driver.md`](../../apps/planner-device/remarkable-lite/docs/test-driver.md) | `paperctl` navigation + capture                                     |

### Reference mockups → device screens

| Reference file                 | Maps to current baseline                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| `01-home-hub-ia-only.png`      | `01-home.png` + `02-today.png` (split today; target is merged hub)  |
| `06-notes-gallery.png`         | `03-write.png`                                                      |
| `05-editor-tools-revealed.png` | `10-write-native-ink.png` (tools always on; target has chrome-hide) |
| `02-global-search.png`         | — (not implemented)                                                 |
| `03-new-note.png`              | — (`notes.new` skips templates)                                     |
| `04-page-overview.png`         | — (single page per note)                                            |

### Device evidence captured (2026-07-10)

```bash
apps/planner-device/remarkable-lite/scripts/paperctl doctor   # bridge OK
# Baseline: docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/
```

| File                      | Page              | Notes                                           |
| ------------------------- | ----------------- | ----------------------------------------------- |
| `01-home.png`             | Home              | Clock + NOW + FOCUS; no recent notes / search   |
| `02-today.png`            | Today             | Task checklist + pager; separate tab from Home  |
| `03-write.png`            | Write / Notebooks | 2-tab gallery; bordered thumbnails              |
| `04-more.png`             | More hub          | Secondary nav to Inbox / Review / System        |
| `05-inbox.png`            | Inbox             | Mail-style list                                 |
| `07-review.png`           | Review            | Shutdown checklist                              |
| `09-system.png`           | System            | Full-page settings dashboard                    |
| `10-write-native-ink.png` | Native ink        | Left text rail (P1/P2/Erase); no page indicator |

**Rule:** device screenshots override mockup assumptions when they conflict.

---

## 2. Executive summary

PaperOS on Move is **technically usable** (launcher, cache, CJK, pagination, native ink, crash recovery) but **product-architecturally still a 6-module tab shell** from the Shell MVP era.

The new brief requires a **three-layer OS model**:

```text
Layer 1 — System nav     Home/Today · Notes · Tasks · Documents · Settings  (temporary surfaces)
Layer 2 — Notes nav      Recent · All · Folders · Favorites · Tags · Trash
Layer 3 — Notebook nav   Editor · Page overview · Outline · Search-in-notebook
```

**Current shell** uses a permanent bottom tab bar (`Home / Today / Write / ···`) and hides Inbox / Review / System behind `More`. That directly conflicts with brief §1, §7.2, §15 (no permanent rail; no bottom bar in editor).

**Highest-impact gaps (P0):**

1. Navigation shell — no System drawer, Quick switcher, or Control center
2. Home/Today split — should merge into one landing with Continue writing + Recent notes + Tasks
3. Notes gallery — wrong IA (Notebooks vs Notes), missing tabs/folders/favorites, `+` skips template picker
4. Note editor — fixed chrome rail; no chrome-hide, page indicator, or Page overview
5. Entire flows missing — New Note templates, Global Search, Gallery/Page selection modes

**What is already aligned (keep, don't regress):**

- Typography-first Home (no cards) — directionally correct, needs content blocks added
- Today task list as divider-separated rows (not card-per-task)
- Notes gallery 2-column grid intent in `NotesPage.qml`
- Native ink full-framebuffer takeover (`InkModeController`)
- `paperctl` bridge for semantic navigation + screenshots
- Offline footer pattern exists — but should show only on error/offline (brief §7.1)

---

## 3. Architecture gap matrix

| Dimension            | Current (device + code)                    | Target (brief)                                                             | Severity |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| Primary navigation   | Bottom tab bar always visible (`Main.qml`) | System drawer + overlays; no permanent rail                                | **P0**   |
| Home vs Today        | Two tabs, two pages                        | Single **Home/Today** destination                                          | **P0**   |
| Write tab label      | "Write" → `NotesPage` titled "Notebooks"   | **Notes** gallery with hamburger + 4 tabs                                  | **P0**   |
| Secondary modules    | Inbox / Review / System via More           | Tasks / Documents / Settings via drawer                                    | **P0**   |
| Search               | None                                       | Global Search + Search in Notebook                                         | **P0**   |
| New note flow        | `notes.new` → `createNote("quick")` → ink  | Template picker → immediate create                                         | **P0**   |
| Multi-page notebooks | Single `page-001.png` per note             | Page Overview grid + selection mode                                        | **P0**   |
| Editor chrome        | Always-on top bar + left tool rail         | Collapsible; near edge-to-edge canvas                                      | **P0**   |
| Gestures             | Tap only                                   | Edge swipe drawer / quick switcher / control center + visible alternatives | **P0**   |
| Visual tokens        | `ink` / `muted` / `divider` + ad-hoc grays | Four levels: Ink 100/70/30 + Paper                                         | **P0**   |
| Sync status          | `offline • fast` often visible             | Healthy sync hidden; explicit offline/error only                           | **P1**   |

---

## 4. Screen-by-screen gaps (P0 matrix)

Brief IDs reference [`paperos-eink-uiux-agent-brief.md` §6](./paperos-eink-uiux-agent-brief.md).

### 01 — Home / Today

|              | Current                               | Target                                                                                          | Code anchor                         |
| ------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| Layout       | Home: clock, NOW, FOCUS, summary line | Unified hub: **search entry**, **Continue writing**, **Recent notes**, **Tasks**, **Documents** | `HomePage.qml`, `TodayPage.qml`     |
| Tasks        | Separate Today tab with pager         | Tasks section inside Home/Today                                                                 | `TodayPage.qml` → extract component |
| Recent notes | Missing                               | List or thumbnails of last edited notebooks                                                     | New component                       |
| Search       | Missing                               | Tap-to-enter search (not permanent field on home)                                               | New `SearchEntry.qml`               |
| Footer       | `offline • fast` on Home              | Only when offline / sync error                                                                  | `StatusLine.qml`, `HomePage.qml`    |

**Modify:** Merge into `HomeTodayPage.qml`; remove Today as top-level tab.

---

### 02 — System drawer

|     | Current                           | Target                                                                               |
| --- | --------------------------------- | ------------------------------------------------------------------------------------ |
|     | `MorePage.qml` + bottom `···` tab | Left-edge / hamburger **temporary drawer**: Today, Notes, Tasks, Documents, Settings |

**Modify:** New `SystemDrawer.qml`; delete More-as-navigation pattern.

---

### 03 — Notes Gallery

|              | Current (`baseline-2026-07-10/03-write.png`) | Target ([`06-notes-gallery.png`](./paperos/reference/2026-07-10/06-notes-gallery.png)) |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Header       | "Notebooks" + count + "On this device"       | **Menu · Notes · +**                                                                   |
| Tabs         | Recent, All notebooks (2)                    | Recent, All, **Folders**, **Favorites** (4)                                            |
| Thumbnail    | 2px black border, `#F4F4F1` fill             | Paper object, 2–4px radius, **no heavy frame**                                         |
| Create       | Black 88×88 `+` → direct ink                 | `+` → **New Note** screen                                                              |
| Selection    | None                                         | Long-press → selection mode                                                            |
| Stars / sync | None                                         | Corner favorite; sync icon only if pending/error                                       |

**Modify:** `NotesPage.qml` — header, tabs, thumbnail chrome, `notes.new` routing.

---

### 04–05 — Gallery / Page selection modes

**Status:** Not implemented.

**Modify:** New `GallerySelectionMode.qml`; wire long-press on `notes.item.*`.

---

### 06–08 — Note Editor (clean / chrome-hidden / tools expanded)

|             | Current (`baseline-2026-07-10/10-write-native-ink.png`) | Target ([`05-editor-tools-revealed.png`](./paperos/reference/2026-07-10/05-editor-tools-revealed.png) = tools **revealed**, not default) |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas      | Inset by 96px rail + 88px top bar                       | **Edge-to-edge** paper                                                                                                                   |
| Tools       | P1 / P2 / Erase text + color dots                       | Narrow floating rail: pen, eraser, —, undo, handle                                                                                       |
| Chrome hide | Always visible                                          | Hide 1–2s after writing; tap top edge / handle to reveal                                                                                 |
| Page #      | Missing                                                 | **12 / 38** bottom-right; tap → Page overview                                                                                            |
| Top bar     | `< Back` + title only                                   | Back · Title · **More**                                                                                                                  |

**Modify:** `InkModeController.cpp` (`paintChrome`, zones, state machine); optional QML overlay split.

---

### 10–11 — Page Overview + selection

**Status:** Not implemented (single page per note in `NoteStore.cpp`).

**Modify:** New `PageOverviewPage.qml`; extend `NoteStore` for multi-page CRUD.

---

### 12–13 — New Note + More Templates

|               | Current               | Target ([`03-new-note.png`](./paperos/reference/2026-07-10/03-new-note.png)) |
| ------------- | --------------------- | ---------------------------------------------------------------------------- |
| Flow          | Skip templates        | Blank / Ruled / Dotted / Last used + category row                            |
| Title field   | N/A (auto quick note) | **No title before creation**                                                 |
| Create button | Implicit on `+`       | **Tap template = create immediately**                                        |

**Modify:** New `NewNotePage.qml`, `MoreTemplatesPage.qml`; change `notes.new` handler.

---

### 14–16 — Search + Quick Switcher

**Status:** Not implemented. Targets: [`02-global-search.png`](./paperos/reference/2026-07-10/02-global-search.png), home search entry in [`01-home-hub-ia-only.png`](./paperos/reference/2026-07-10/01-home-hub-ia-only.png).

**Modify:** `SearchPage.qml`, `NotebookSearchPage.qml`, `QuickSwitcherOverlay.qml`.

---

### 17–18 — Offline state + Control Center

|          | Current           | Target                                                      |
| -------- | ----------------- | ----------------------------------------------------------- |
| Offline  | Footer text       | Non-blocking banner; writing still works                    |
| Settings | Full `SystemPage` | **Control center** overlay (top swipe) + Settings as detail |

**Modify:** `ControlCenterOverlay.qml`; demote `SystemPage` to settings detail.

---

## 5. Modules to retire or merge

| Current module     | File             | Brief disposition                               |
| ------------------ | ---------------- | ----------------------------------------------- |
| Bottom tab bar     | `Main.qml`       | **Remove** — replace with drawer + route stack  |
| More hub           | `MorePage.qml`   | **Remove** as nav — fold into System drawer     |
| Today tab          | `TodayPage.qml`  | **Merge** into Home/Today                       |
| Inbox              | `InboxPage.qml`  | Merge into **Tasks** or Home section            |
| Review             | `ReviewPage.qml` | Merge into Today workflow / Tasks               |
| System (full page) | `SystemPage.qml` | Split: Control center overlay + Settings detail |

---

## 6. Visual system gaps (Phase 0)

Brief §4. Apply before polishing individual screens.

| Rule                       | Current violation                                                   | Fix                                                   |
| -------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Four grayscale tokens only | `#EEEEEE` selection, `#F4F4F1` thumb bg, `#C9C9C5`, `#555555` muted | Map to Ink 100/70/30/Paper in `main.cpp` Ui injection |
| Delete 50–70% borders      | Thumb 2px border, `PaperButton` outlines, System segmented controls | Audit all `border.width` in `qml/`                    |
| Radius semantics           | Same sharp rects everywhere                                         | modal 16–20, control 10–12, thumb 2–4                 |
| No nested cards            | Thumb frame inside grid cell                                        | Thumb = paper only                                    |
| Healthy sync hidden        | Status on Home + Inbox footers                                      | `StatusLine` gating                                   |

---

## 7. Implementation phases (superseded by slice plan)

**Use [`paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md) instead of the Phase 0–3 list below.**

| Slice | Status | Focus |
| ----- | ------ | ----- |
| **Core Slice 1** | Shipped 2026-07-10 | Drawer, Gallery, native ink chrome, semantic capture |
| **Core Slice 1.1** | **Now** | Toolbar state bug (P0) + Gallery/`+`/Drawer visual cleanup |
| **Core Slice 2** | Next | Merge Home/Today; final drawer IA |
| **Slice 3–6** | Deferred | Multi-page, Templates, Search/OCR, Quick Switcher / Control Center |

Legacy phase outline (historical reference only):

### Phase 0 — System language (1–2 days)

- [ ] Define `Ink100` / `Ink70` / `Ink30` / `Paper` in Ui singleton
- [ ] Global border/radius audit
- [ ] State semantics: current / selected / pressed / focus / disabled

### Phase 1 — Navigation shell (2–4 days)

- [ ] `SystemDrawer.qml` replaces bottom tabs + More
- [ ] `HomeTodayPage.qml` merges Home + Today
- [ ] `QuickSwitcherOverlay.qml`
- [ ] Editor chrome auto-hide (minimum viable)
- [ ] Hide healthy sync indicators

### Phase 2 — Three core experiences (3–6 days) — **determines OS vs web-app feel**

- [ ] Notes Gallery rebuild (`NotesPage.qml`)
- [ ] Note Editor states (`InkModeController.cpp`)
- [ ] Page Overview (`PageOverviewPage.qml` + `NoteStore`)

### Phase 3 — Supporting flows (3–5 days)

- [ ] New Note / More Templates
- [ ] Global Search (+ handwriting index stub)
- [ ] Folder browser, selection modes
- [ ] Offline / conflict / storage-full states
- [ ] Control center

---

## 8. File → work mapping

| Work item       | Primary files                                                     |
| --------------- | ----------------------------------------------------------------- |
| Shell / routing | `qml/Main.qml`                                                    |
| Home/Today      | `qml/HomePage.qml`, `qml/TodayPage.qml` → new `HomeTodayPage.qml` |
| Notes gallery   | `qml/NotesPage.qml`                                               |
| System drawer   | **new** `qml/SystemDrawer.qml`                                    |
| Quick switcher  | **new** `qml/QuickSwitcherOverlay.qml`                            |
| Control center  | **new** `qml/ControlCenterOverlay.qml`                            |
| New note        | **new** `qml/NewNotePage.qml`, `qml/MoreTemplatesPage.qml`        |
| Page overview   | **new** `qml/PageOverviewPage.qml`                                |
| Search          | **new** `qml/SearchPage.qml`, `qml/NotebookSearchPage.qml`        |
| Editor chrome   | `src/InkModeController.cpp`, `src/InkModeController.h`            |
| Note data       | `src/NoteStore.cpp`                                               |
| Design tokens   | `src/main.cpp` (Ui context properties)                            |
| Device QA       | `scripts/paperctl`, `docs/test-driver.md`                         |

---

## 9. Acceptance criteria snapshot (brief §14)

| Area                                      | Pass? | Blocker                      |
| ----------------------------------------- | ----- | ---------------------------- |
| Global: 50%+ borders removed              | ❌    | Thumb + buttons + System     |
| Global: no nested cards                   | ❌    | Notes thumbnails             |
| Global: four grayscale levels             | ❌    | Ad-hoc hex colors            |
| Global: no permanent bottom bar in editor | ❌    | `Main.qml` tab bar always on |
| Gallery: content in upper 20%             | ⚠️    | 104px header too tall        |
| Gallery: paper thumbs not framed cards    | ❌    | 2px border + gray fill       |
| Editor: near full-screen canvas           | ❌    | Fixed rail                   |
| Editor: chrome hides while writing        | ❌    | Not implemented              |
| Editor: page number once                  | ❌    | Missing                      |
| New Note: template-first                  | ❌    | Direct ink entry             |
| Search                                    | ❌    | Missing                      |
| Quick Switcher overlay                    | ❌    | Missing                      |
| Page Overview                             | ❌    | Missing                      |

Full checklist: [`paperos-eink-uiux-agent-brief.md` §14](./paperos-eink-uiux-agent-brief.md).

---

## 10. End-to-end flows to prove (brief §17)

Before declaring PAPR.UI done, capture device evidence for each:

1. Open Notes from System drawer
2. Find and open a notebook
3. Begin writing → chrome retreats
4. Expand tools → switch pen
5. Page Overview → navigate pages
6. Page selection mode → move a page
7. New note from Blank template
8. Search handwriting → open exact match
9. Quick Switcher from inside editor
10. Continue writing offline → non-blocking sync state

---

## 11. Antigravity review handoff

**Mission:** Review this audit + brief against device baseline; propose optimized phase ordering and risk flags; refresh screenshot inventory.

### Inputs to read (in order)

1. This document
2. [`paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md)
3. Device baseline: `docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`
4. Reference mockups: [`paperos/reference/2026-07-10/`](./paperos/reference/2026-07-10/) + [README](./paperos/reference/2026-07-10/README.md)
5. [`../roadmap/apps/planner-pro-move.md`](../roadmap/apps/planner-pro-move.md) § PAPR.UI

### Review questions

- Is Phase 0–3 ordering correct, or should Page Overview precede Gallery polish?
- Can `InkModeController` chrome-hide ship before drawer refactor, or must shell come first?
- Which P0 screens can share components (e.g. selection mode header)?
- Any brief requirement that conflicts with Shell MVP constraints (session model, no xochitl patch)?
- Suggested screenshot matrix for regression (routes × states).

### Expected outputs

- [ ] Comment on phase ordering / dependencies
- [ ] Updated screenshot set under `docs/ui-qa-screenshots/paperos/device/latest/`
- [ ] Optional: annotated diff notes per screen
- [ ] Sign-off or revision list on §9 acceptance table

### Capture commands

```bash
apps/planner-device/remarkable-lite/scripts/paperctl doctor
# Navigate + shot — see test-driver.md
apps/planner-device/remarkable-lite/scripts/paperctl tap nav.today
apps/planner-device/remarkable-lite/scripts/paperctl screenshot docs/ui-qa-screenshots/paperos/device/latest/02-today.png
```

---

## 12. Related documents (cross-links)

| Doc                                                                                                                              | Update                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md) | **Execution SSOT** — Slice 1.1 / 2 |
| [`paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md) | Long-term product brief |
| [`paperos/reference/2026-07-10/README.md`](./paperos/reference/2026-07-10/README.md)                                             | Reference mockup usage rules                               |
| [`../roadmap/apps/planner-pro-move.md`](../roadmap/apps/planner-pro-move.md)                                                     | PAPR.UI scope → points here                              |
| [`../PRO_MOVE_STATUS_VS_IDEAL.md`](../PRO_MOVE_STATUS_VS_IDEAL.md)                                                               | Technical gaps; UI section added                           |
| [`../roadmap/AGENT_WORKSTREAMS.md`](../roadmap/AGENT_WORKSTREAMS.md)                                                             | Line B sessions realigned                                  |
| [`../../apps/planner-device/remarkable-lite/docs/test-driver.md`](../../apps/planner-device/remarkable-lite/docs/test-driver.md) | Screenshot workflow                                        |
| [`../PRO_MOVE_SHELL_MVP_GATE.md`](../PRO_MOVE_SHELL_MVP_GATE.md)                                                                 | Historical — 6-tab shell shipped; UI pivot documented here |
| [`../PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md`](../PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md)                               | Ink runtime — editor chrome must stay compatible           |

---

## 13. Explicit non-goals (unchanged)

From brief §15 and roadmap non-goals:

- No xochitl patching or boot replacement
- No glass/blur/LCD-first animation
- No analytics or recommendation feeds
- No permanent left rail or editor bottom bar
- No production write enablement as part of UI work

---

_Next owner: Slice 1.1 (Sol/Codex native + Cursor Auto QML) → Antigravity delta QA._
