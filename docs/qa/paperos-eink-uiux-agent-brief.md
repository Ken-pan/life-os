# PaperOS E‑ink Notes UX/UI — Agent Execution Brief

**Date:** 2026-07-10
**Status:** Ready for design / implementation planning
**Scope:** PaperOS Notes system on a portrait E‑ink tablet
**Primary goal:** Turn the current polished black-and-white app concept into a native, immersive, paper-first E‑ink operating experience.

---

## TL;DR

The current UI has a usable information architecture, but it still behaves and looks like a card-based SaaS app. The next iteration must move to:

> **Paper canvas + contextual tools + temporary system surfaces**

Do not solve hierarchy by placing every object inside a rounded rectangle. Use space, content, state, and behavior to communicate structure.

The first complete design pass must cover the whole navigation shell, not only six happy-path pages.

---

## Evidence package (canonical paths)

| Artifact | Path |
| -------- | ---- |
| **Execution SSOT** | [`docs/qa/paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md) |
| This brief (long-term) | [`docs/qa/paperos-eink-uiux-agent-brief.md`](./paperos-eink-uiux-agent-brief.md) |
| Gap audit | [`docs/qa/paperos-eink-uiux-gap-audit.md`](./paperos-eink-uiux-gap-audit.md) |
| Core Slice 1 gates | [`paperos-core-slice-1-integration-gate.md`](./paperos-core-slice-1-integration-gate.md) · [`paperos-core-slice-1-visual-gate.md`](./paperos-core-slice-1-visual-gate.md) |
| Reference mockups (design direction) | [`docs/qa/paperos/reference/2026-07-10/`](./paperos/reference/2026-07-10/) — [usage README](./paperos/reference/2026-07-10/README.md) |
| Device baseline (2026-07-10)         | `docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/`                                                                          |
| Subsequent device captures           | `docs/ui-qa-screenshots/paperos/device/latest/`                                                                                       |

Reference files:

- `01-home-hub-ia-only.png` — Home/Today IA (not literal card chrome)
- `02-global-search.png` — Global Search
- `03-new-note.png` — New Note templates
- `04-page-overview.png` — Page Overview
- `05-editor-tools-revealed.png` — Editor tools **revealed** (not default writing)
- `06-notes-gallery.png` — Notes Gallery

**Rule:** real device screenshots override mockup assumptions. **Active execution:** follow `paperos-next-ui-update-guide.md` (Slice 1.1 → 2); this brief remains the long-term product north star.

---

# 1. Product model

PaperOS should have three interaction layers.

## Layer 1 — System navigation

System-level destinations:

```text
Home / Today
Notes
Tasks
Documents
Settings
```

These destinations must not permanently occupy a heavy left rail.

They should be available through:

- Left-edge swipe → System drawer
- Top-left menu button → System drawer
- Hardware/edge gesture → Quick switcher
- Top-edge swipe → Control center
- Home/system action → Home / Today

## Layer 2 — Notes navigation

```text
Notes
├── Recent
├── All notes
├── Folders
├── Favorites
├── Tags
└── Trash
```

## Layer 3 — Notebook navigation

```text
Notebook
├── Note Editor
├── Page Overview
├── Notebook Outline
│   ├── Headings
│   ├── Bookmarks
│   └── Links
├── Search in Notebook
└── Notebook Settings
```

---

# 2. Complete navigation map

```text
Home / Today
│
├── Notes
│   ├── Recent
│   ├── All notes
│   ├── Folders
│   │   └── Folder detail
│   ├── Favorites
│   ├── Tags
│   └── Trash
│
├── Tasks
├── Documents
└── Settings

Notes Gallery
│
├── New Note
│   ├── Blank
│   ├── Ruled
│   ├── Dotted
│   ├── Last used
│   └── More Templates
│
├── Search
│
└── Notebook
    ├── Note Editor
    │   ├── Clean writing state
    │   ├── Chrome-hidden state
    │   ├── Expanded tools
    │   ├── Pen settings
    │   ├── Lasso selection
    │   ├── Handwriting conversion
    │   └── Notebook outline
    │
    └── Page Overview
        ├── Browse pages
        ├── Select pages
        ├── Reorder
        ├── Move / Copy
        └── Add page
```

Global temporary surfaces:

```text
System drawer
Quick switcher
Control center
Context menu
Confirmation sheet
Sync error
Offline status
Conflict resolution
```

---

# 3. Core flows

## 3.1 Continue writing

```text
Home / Today
→ Continue writing
→ Note Editor
→ Chrome hides after pen activity
```

## 3.2 Find and open a notebook

```text
System drawer
→ Notes
→ Gallery
→ Tap notebook
→ Note Editor
```

## 3.3 Create a notebook

```text
Notes Gallery
→ Tap +
→ New Note
→ Tap Blank / Ruled / Dotted / Last used
→ Note Editor
```

Selecting a template should create the note immediately. Do not force title entry before writing.

## 3.4 Navigate pages

```text
Note Editor
→ Tap page indicator
→ Page Overview
→ Tap page
→ Note Editor at selected page
```

## 3.5 Organize notebooks

```text
Notes Gallery
→ Long press notebook
→ Selection mode
→ Move / Tag / Favorite / Export / Delete
```

## 3.6 Search handwriting

```text
Notes Gallery or Note Editor
→ Search
→ Enter query
→ Handwriting result
→ Open exact notebook page and focus hit region
```

## 3.7 Quick switch

```text
Any screen
→ Edge gesture / system action
→ Quick switcher overlay
→ Tap destination
→ Overlay disappears
```

---

# 4. System-level visual rules

## 4.1 Content as canvas

The content should feel like the interface itself.

Do:

- Let paper, handwriting, thumbnails, and document content dominate.
- Use whitespace to group.
- Use temporary surfaces only when action is required.
- Allow the Note Editor canvas to approach edge-to-edge.

Do not:

- Place every section inside a rounded card.
- Place rows inside a card, inside another card.
- use large permanent headers on task-focused pages.
- create multiple nested screen borders.

## 4.2 Four grayscale tokens

Use only four semantic levels.

| Token     | Usage                                           |
| --------- | ----------------------------------------------- |
| `Ink 100` | Current selection, primary text, primary action |
| `Ink 70`  | Normal text, icons, secondary controls          |
| `Ink 30`  | Dividers, disabled state, inactive metadata     |
| `Paper`   | Main canvas and paper surfaces                  |

Do not rely on subtle 5%–15% gray differences.

## 4.3 Radius semantics

| Object                         |   Radius |
| ------------------------------ | -------: |
| Modal / temporary overlay      | 16–20 px |
| Search field / primary control | 10–12 px |
| Small button                   |   6–8 px |
| Paper thumbnail                |   2–4 px |
| Normal content group           |     0 px |

Do not apply the same large radius everywhere.

## 4.4 Typography

Use two voices only:

- **System UI:** Sans-serif
- **User content:** Handwriting or document typography

Large serif titles are reserved for onboarding, editorial, or empty states.

Do not use large serif titles on every functional screen.

## 4.5 Borders

Delete 50%–70% of current borders.

Keep borders only for:

- Input fields
- Selected/focused state
- Modal boundaries
- Error/danger states
- Real paper/document edges

---

# 5. Contextual chrome rules

## Writing mode

After 1–2 seconds of active writing:

```text
Top bar hides or collapses
Tool rail collapses
Page indicator remains minimal or hides
Canvas expands
```

Reveal chrome when:

- User taps top edge
- User taps tool handle
- User pauses and explicitly requests controls
- Error or conflict requires attention

Do not animate heavily. Use discrete state changes suitable for E‑ink refresh.

## Gallery mode

Default state shows:

- Menu
- Page title
- Add action
- Lightweight category navigation
- Notebook content

Do not permanently show:

- Search field and search icon together
- Sort
- More menu on every note
- Sync status if healthy
- Batch actions before selection mode

## Selection mode

Selection mode replaces normal chrome.

Example:

```text
Cancel        3 selected

Move
Tag
Favorite
Export
Delete
```

Object actions must not appear before selection.

---

# 6. Required screen matrix

## P0 — Must design

|  ID | Screen / State               | Purpose                    |
| --: | ---------------------------- | -------------------------- |
|  01 | Home / Today                 | System landing page        |
|  02 | System drawer                | Global navigation          |
|  03 | Notes Gallery                | Browse notebooks           |
|  04 | Gallery selection mode       | Organize notebooks         |
|  05 | Folder browser               | Browse folders             |
|  06 | Note Editor — clean          | Normal writing             |
|  07 | Note Editor — chrome hidden  | Immersive writing          |
|  08 | Note Editor — tools expanded | Tool access                |
|  09 | Lasso selection              | Edit selected handwriting  |
|  10 | Page Overview                | Browse pages               |
|  11 | Page selection mode          | Batch page operations      |
|  12 | New Note                     | Fast note creation         |
|  13 | More Templates               | Secondary template library |
|  14 | Global Search                | Search across notes        |
|  15 | Search in Notebook           | Search within one notebook |
|  16 | Quick Switcher overlay       | Temporary navigation       |
|  17 | Sync / offline state         | Non-blocking system status |
|  18 | Control Center / Settings    | Device controls            |

## P1 — Recommended

|  ID | Screen / State            |
| --: | ------------------------- |
|  19 | Tags browser              |
|  20 | Trash                     |
|  21 | Notebook outline          |
|  22 | Export / Share            |
|  23 | Move to folder / notebook |
|  24 | Empty states              |
|  25 | Conflict resolution       |
|  26 | Storage full              |
|  27 | Custom template import    |

---

# 7. Detailed screen requirements

## 7.1 Home / Today

Purpose:

- Resume current work
- See essential tasks
- Reach recent notes

Recommended content:

```text
Today
Continue writing
Upcoming tasks
Recent notes
```

Rules:

- No analytics dashboard
- No news or recommendations
- No carousel
- No excessive widgets
- Content-first, quiet, and actionable

Primary actions:

- Continue writing
- Open today’s note
- Complete task
- Open recent notebook

---

## 7.2 System drawer

Temporary left-edge drawer.

Contains:

```text
Today
Notes
Tasks
Documents

Settings
```

Secondary status:

- Battery
- Wi-Fi
- Sync error only if present

Rules:

- No permanent left navigation rail
- Drawer closes after navigation
- Current destination uses `Ink 100`
- Other destinations use plain rows, not cards

---

## 7.3 Notes Gallery

Structure:

```text
Menu    Notes    Add

Recent   All   Folders   Favorites
──────

[paper thumbnail]  [paper thumbnail]
Title              Title
metadata           metadata
```

Rules:

- Two-column layout
- Paper thumbnail is the primary object
- Title and one metadata line below
- No card footer
- No More icon on every item
- Favorite may be a small corner marker
- Sync icon only when pending/error
- Search is entered from the top bar, not a permanent field
- Tabs are text + underline, not a large segmented pill
- No bottom sync bar when healthy

Interactions:

| Input        | Action               |
| ------------ | -------------------- |
| Tap notebook | Open                 |
| Long press   | Enter selection mode |
| Tap +        | New Note             |
| Tap category | Change collection    |
| Edge swipe   | System drawer        |

---

## 7.4 Gallery selection mode

Trigger:

- Long press a notebook
- Tap Select from overflow

Header:

```text
Cancel      2 selected
```

Actions:

- Move
- Tag
- Favorite
- Duplicate
- Export
- Delete

Rules:

- Do not show normal Add action
- Selected notebooks use checkbox / black selection marker
- Delete is last and requires confirmation
- Return to normal Gallery after completion

---

## 7.5 Folder browser

Structure:

```text
Back    Folders    Add folder

Work
Personal
Research
Archive
```

Rows should be unboxed and separated by space/dividers.

Each folder may show:

- Name
- Notebook count
- Last updated

Required interactions:

- Open folder
- Create folder
- Rename
- Move notebooks
- Delete empty folder
- Reorder optional

---

## 7.6 Note Editor — clean state

Structure:

```text
Back   Project Journal   More

[edge-to-edge paper canvas]

[current tool]
[eraser]
—
[undo]
[tool handle]

                         12 / 38
```

Rules:

- Canvas nearly fills screen
- No large rounded paper container
- Top title is compact and sans-serif
- Show page number once only
- No persistent “Edited just now”
- Tool rail is narrow and secondary
- Current content title must visually dominate app title

---

## 7.7 Note Editor — chrome-hidden state

Trigger:

- Pen writing begins
- No chrome interaction for 1–2 seconds

Visible:

- Canvas
- Optional tiny tool handle
- Optional temporary page indicator

Hidden:

- Top bar
- Tool labels
- Save status
- Extra controls

Reveal:

- Tap top edge
- Tap tool handle
- Pen hover near tool region if hardware supports it

---

## 7.8 Note Editor — expanded tools

Collapsed state:

```text
Current pen
Eraser
Undo
Handle
```

Expanded state:

```text
Pen preset 1
Pen preset 2
Highlighter
Eraser
Lasso
More
```

Rules:

- Tool rail remains narrow
- Pen/eraser/lasso are tools
- Undo/redo are commands and visually separated
- Do not display labels for every tool if icons are clear
- Expanded panel closes after tool selection unless pinned

---

## 7.9 Pen settings

Required controls:

- Pen type
- Thickness
- Gray / color
- Pressure behavior
- Save as preset
- Recent presets

Rules:

- Use one compact contextual panel
- Avoid full-screen settings
- Selection causes local refresh only
- Do not depend on color alone

---

## 7.10 Lasso selection

After lasso completes, show a contextual action strip close to the selection:

```text
Move
Resize
Copy
Cut
Convert
Link
Delete
```

Rules:

- Only show relevant actions
- Avoid animated floating movement
- Use one stable position after selection
- Black highlight only for active action
- Support cancel by tapping outside

---

## 7.11 Page Overview

Normal browsing mode:

```text
Back   Project Journal   Select

[page] [page]
  1      2

[page] [page]
  3      4

+ Add page
```

Rules:

- Default two columns on compact portrait devices
- Page itself is the thumbnail
- No outer card container
- Current page uses a small black page-number badge
- Selected page uses checkbox / selected overlay
- Focus state must differ from current page
- Only Add page is shown in normal mode
- Duplicate / Move / Delete appear only in selection mode

---

## 7.12 Page selection mode

Header:

```text
Cancel      3 selected
```

Actions:

- Duplicate
- Move
- Copy to notebook
- Apply template
- Export
- Delete

Provide both:

- Drag reorder
- “Move to position…” non-drag alternative

---

## 7.13 New Note

First screen only shows:

```text
Blank
Ruled
Dotted
Last used
```

Below:

```text
Planner
Work
Creative
More templates
```

Rules:

- No title field before creation
- No heavy Create button before selection
- Tap template → create immediately
- Selected template may use a 2–3 px black outline
- Templates are paper thumbnails, not product cards
- Add hint: “Tap a template to start writing.”

---

## 7.14 More Templates

Categories:

```text
Paper
Planner
Work
Creative
Custom
```

Capabilities:

- Preview
- Favorite
- Import custom template
- Set default
- Apply to current notebook/page

Rules:

- This is the dense secondary library
- Do not place the entire library on New Note first screen

---

## 7.15 Global Search

Structure:

```text
Back   Search

[Search field]

All   Titles   Handwriting   Tags
────

Titles
result
────────
result

Handwriting matches
result
────────
result

Tags
# planning        3 notes
# research        2 notes
```

Rules:

- Search field is the only prominent container
- Tabs use text + underline
- Results are unboxed rows with dividers
- Priority:
  1. Hit
  2. Source note + page
  3. Context snippet
  4. Time / secondary metadata
- Do not use yellow highlight
- Use underline, bold, black reverse, or thin outlined emphasis
- Sort is hidden inside More/filter
- No large result-group containers
- Tags are simple rows, not pills inside cards

---

## 7.16 Search in Notebook

Title:

```text
Search in Project Journal
```

Results:

- Match count
- Page number
- Snippet
- Thumbnail optional
- Tap opens exact location

Required states:

- Query empty
- Results
- No result
- Handwriting recognition unavailable
- Search indexing in progress

---

## 7.17 Quick Switcher

Must be a temporary overlay.

Example:

```text
Underlying screen dimmed or quiet

┌────────────────────────┐
│ Search notes, tasks…   │
│                        │
│ Recent notes           │
│ Project Journal        │
│ Daily Notes            │
│ Meeting Notes          │
│                        │
│ Tasks                  │
│ Review concepts        │
│                        │
│ Documents              │
│ Design Principles.pdf  │
└────────────────────────┘
```

Rules:

- Occupies about 70%–80% screen height
- No left rail
- No avatar
- No full-page title required
- No Mac shortcuts in touch-only state
- Rows are plain with dividers
- Only focused row uses black reverse style
- Overlay closes immediately after navigation
- Background should show the screen it was invoked from

---

## 7.18 Control Center

Invoked from top edge.

Controls:

- Wi-Fi
- Brightness
- Refresh mode
- Orientation
- Airplane mode
- Sync
- Battery
- Lock

Rules:

- Temporary surface
- Large touch targets
- No nested settings dashboard
- Current mode uses black selected state
- Avoid sliders that require continuous redraw where possible
- Prefer stepped controls on E‑ink

---

# 8. Search and selection states

Every major screen must document:

- Default
- Pressed
- Current
- Selected
- Focused
- Disabled
- Loading
- Empty
- Error
- Offline

Do not use one black border for all of these.

Suggested distinctions:

| State          | Visual                            |
| -------------- | --------------------------------- |
| Current page   | Black page-number badge           |
| Selected       | Checkbox / black selection marker |
| Keyboard focus | Thin/dotted focus outline         |
| Pressed        | Temporary reverse fill            |
| Disabled       | Ink 30                            |
| Error          | Warning icon + text               |
| Offline        | Static offline icon + message     |

---

# 9. E‑ink behavior requirements

## 9.1 Rendering layers

### Instant ink

- Render pen stroke near stylus immediately
- Lowest latency path
- No full app layout
- Temporary lower-fidelity stroke allowed

### Stroke commit

After pen-up:

- Smooth stroke
- Commit vector/path
- Local bounding-box refresh
- Save asynchronously

### Page quality refresh

Use full or larger refresh after:

- Page switch
- Large menu closes
- Image transform completes
- Selection mode exits
- Ghosting threshold reached
- Manual refresh

## 9.2 Avoid

- Continuous opacity animation
- Blur
- Shimmer loading
- Elastic scrolling
- Large area shadows
- Repainting the whole page for every pointer event
- Updating thumbnail after every stroke
- Persisting database writes on every input event
- Infinite-scroll behavior in the Note Editor

## 9.3 Performance targets

| Metric                       |                         Target |
| ---------------------------- | -----------------------------: |
| Stylus to first visible ink  |                         ≤30 ms |
| Tool switch feedback         |                        ≤100 ms |
| Small panel local refresh    |                        ≤250 ms |
| Gallery first usable content |                        ≤700 ms |
| Page switch usable state     |                        ≤500 ms |
| Auto-save                    |             1–2 s after pen-up |
| Crash recovery               | Lose no more than final stroke |

---

# 10. Touch and gesture rules

## Input model

| Input            | Canvas                  | Gallery   | Page Overview                   |
| ---------------- | ----------------------- | --------- | ------------------------------- |
| Stylus           | Write / select          | Open item | Open / reorder in explicit mode |
| Finger tap       | Reveal UI / navigate    | Open      | Open                            |
| Horizontal swipe | Page turn               | Avoid     | Page-group navigation           |
| Vertical swipe   | Pan only when zoomed    | Browse    | Browse                          |
| Long press       | Context action          | Select    | Select                          |
| Edge swipe       | Quick switcher / drawer | Drawer    | Back / drawer                   |
| Pinch            | Zoom                    | None      | Optional density change         |

Hard rules:

1. Stylus writes by default.
2. Finger navigates by default.
3. Every gesture must have a visible control alternative.
4. Palm contact must not open menus, switch pages, or move canvas.
5. Drag reorder must have a “Move to position…” alternative.

---

# 11. Empty, error, and sync states

## Offline

```text
Saved on this device
Will sync when online
```

Writing must remain fully available.

## Sync failed

```text
Couldn’t sync Project Journal

Retry
View details
```

## Conflict

```text
Two versions found

Keep this device version
Keep cloud version
Keep both
```

Never silently overwrite.

## Storage full

```text
Storage almost full

Manage files
```

## Empty gallery

```text
No notes yet

Create note
Import document
```

## No search results

```text
No results for “project-x”

Search titles
Search handwriting
Check spelling
```

---

# 12. Implementation priority

## Phase 0 — System language, 1–2 design days

1. Delete 50%–70% of rounded outlines.
2. Define four grayscale tokens.
3. Define radius semantics.
4. Standardize sans-serif system typography.
5. Define current / selected / focus / pressed states.

## Phase 1 — Navigation and chrome, 2–4 design days

1. Build system drawer.
2. Build Home / Today.
3. Make Quick Switcher an overlay.
4. Hide Note Editor chrome during writing.
5. Move batch actions into selection mode.
6. Remove duplicate search entry points.
7. Remove permanent healthy sync states.

## Phase 2 — Three core experiences, 3–6 design days

1. Notes Gallery
2. Note Editor
3. Page Overview

These three determine whether PaperOS feels like an OS or a black-and-white web app.

## Phase 3 — Supporting flows, 3–5 design days

1. New Note / More Templates
2. Search
3. Folder browser
4. Selection states
5. Sync / offline / conflict
6. Control center

---

# 13. Deliverables expected from the Agent

## Design deliverables

Produce:

1. Updated navigation map
2. Screen inventory
3. State matrix
4. High-fidelity mockups for P0 screens — see [`paperos/reference/2026-07-10/`](./paperos/reference/2026-07-10/)
5. Component/state specifications
6. Interaction annotations
7. E‑ink refresh annotations
8. Responsive notes for portrait device
9. Accessibility notes
10. Before/after comparison for the three core pages — device baseline vs reference mockups in [`paperos-eink-uiux-gap-audit.md`](./paperos-eink-uiux-gap-audit.md) §1

## Engineering deliverables

For each implemented screen, provide:

- Route / entry point
- UI state model
- Input source behavior
- Local vs full refresh policy
- Loading / offline / error handling
- Test scenario
- Screenshot evidence — `docs/ui-qa-screenshots/paperos/device/latest/` (rolling) or dated baseline subfolder
- Performance evidence where relevant

---

# 14. Acceptance criteria

## Global

- [ ] At least 50% of prior decorative borders are removed.
- [ ] No nested card-inside-card presentation on primary screens.
- [ ] Only four grayscale semantic levels are used.
- [ ] System UI uses sans-serif.
- [ ] Large serif headings do not dominate functional pages.
- [ ] Search, sort, More, and batch actions appear only when context requires them.
- [ ] Touch-only mode shows no desktop keyboard shortcuts.
- [ ] Every gesture has a visible alternative.
- [ ] Healthy sync state is not permanently displayed.
- [ ] Error and offline states are explicit and non-blocking.

## Notes Gallery

- [ ] First note content appears within the upper 20% of the screen.
- [ ] Gallery uses paper thumbnails, not framed media cards.
- [ ] Search icon and search field are not both present.
- [ ] Overflow controls are hidden until context/selection.
- [ ] Two-column layout remains readable.

## Note Editor

- [ ] Canvas is near edge-to-edge.
- [ ] Page number is shown once.
- [ ] Top chrome recedes during writing.
- [ ] Tool rail can collapse.
- [ ] Undo is visually separated from tools.
- [ ] No persistent “Edited just now”.
- [ ] Normal writing is possible offline.

## Page Overview

- [ ] Current page and selected page use different visual states.
- [ ] Normal mode shows only Add page.
- [ ] Batch operations appear only in selection mode.
- [ ] Page thumbnails are unboxed paper objects.
- [ ] Two-column compact layout is provided.
- [ ] Non-drag reorder is supported.

## New Note

- [ ] First screen shows only Blank, Ruled, Dotted, Last used.
- [ ] No required title field before creation.
- [ ] No premature Create button.
- [ ] Tap template creates/open note directly.

## Search

- [ ] Search field is the only prominent outlined control.
- [ ] Result groups have no large enclosing cards.
- [ ] Hit content has the highest visual priority.
- [ ] No yellow-dependent highlighting.
- [ ] Tags are simple rows.
- [ ] Sort is contextual, not permanent.

## Quick Switcher

- [ ] It is an overlay, not a full destination page.
- [ ] Underlying context is visible.
- [ ] No permanent left rail.
- [ ] No Mac shortcut hints in touch-only state.
- [ ] Only active result uses strong black treatment.

---

# 15. Explicit non-goals

Do not:

- Rebuild this as a generic responsive web dashboard.
- Add glass, blur, translucent layers, or LCD-first animation.
- Add decorative widgets.
- Add analytics.
- Add recommendation feeds.
- Add a permanent left navigation rail.
- Add a bottom navigation bar to the Note Editor.
- Show every feature simultaneously.
- Use color as the only state indicator.
- Optimize for desktop keyboard first.
- hide destructive outcomes without confirmation.

---

# 16. Agent execution order

Follow this exact order:

```text
1. Audit current routes and components
2. Map current navigation
3. Produce proposed navigation map
4. Define global tokens and state semantics
5. Rebuild Notes Gallery
6. Rebuild Note Editor states
7. Rebuild Page Overview states
8. Add System Drawer and Home / Today
9. Add New Note and Search
10. Add Quick Switcher overlay
11. Add error/offline states
12. Validate on real E‑ink device
13. Capture screenshots and performance evidence
14. Report gaps and next steps
```

Do not start by polishing minor icons before the navigation, state model, and chrome behavior are correct.

---

# 17. Final instruction to the Agent

Treat PaperOS as a native paper operating system, not a monochrome web app.

The success criterion is not:

> Every component looks complete.

It is:

> The user can forget the components exist and focus on the paper, while controls appear only when needed.

Before declaring completion, demonstrate these flows end-to-end:

1. Open Notes from the System drawer.
2. Find and open a notebook.
3. Begin writing and show chrome retreat.
4. Expand tools and switch pen.
5. Open Page Overview and navigate pages.
6. Enter page selection mode and move a page.
7. Create a new note from Blank.
8. Search handwriting and open the exact match.
9. Invoke Quick Switcher from inside the Editor.
10. Continue writing while offline and show a non-blocking sync state.

Provide screenshots or device evidence for each flow.
