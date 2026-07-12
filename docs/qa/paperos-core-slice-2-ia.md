# PaperOS `PAPR.UI.2` Information Architecture and UX Specification

**Date:** 2026-07-12

**Status:** **IMPLEMENTED, automated device gate PASS** (2026-07-12); full
acceptance-matrix sign-off still pending owner review — see §11.

**Scope:** IA/design **and** QML implementation of the unified Today landing
and Layer-1 navigation, both authorized and completed 2026-07-12.

**Implementation baseline:** `feat/p-move-ui-slice-1-1-visual-cleanup` (`fdfc3f3f`)
merged into `agent/papr-ui-2-ia`; the pre-existing stale, uncommitted
2026-07-10 `HomeTodayPage.qml`/`DocumentsPage.qml` draft in that worktree was
**not** used as source of truth (per §8 checklist below) — everything in §11
is freshly written against this document.

**Product principle:** paper canvas + contextual tools + temporary system surfaces

This document was originally docs/design-only; §11 records that the owner
subsequently authorized and the QML implementation was completed, built, and
device-gated the same day. When this document conflicts with a concept
mockup, the committed Slice 1.1 contracts and real device evidence take
precedence.

## 0. Scope and invariants

Slice 2 changes only the visible Layer-1 information architecture and the page
hierarchy required to support it.

```text
Primary
Today
Notes
Tasks
Documents

Secondary
Settings
Return to reMarkable
```

The following invariants are non-negotiable:

- Home is not a second destination, screen, label, or dashboard alongside Today.
- Today is the default route after PaperOS has entered successfully.
- All visible notes, tasks, documents, counts, sync states, and lifecycle states
  are derived from an existing contract. Missing capability is shown honestly or
  omitted; it is never filled with sample data.
- Search has no visible field, icon, disabled row, shortcut, or placeholder in
  production until a real searchable index and result navigation contract exist.
- Notes Gallery, the temporary System Drawer, native ink chrome, toolbar state,
  semantic capture, note format, and lifecycle ownership do not regress.
- No screen in this slice claims sleep, wake, idle, periodic sync, auto-launch,
  restart, recovery, or other lifecycle behavior that its owning track has not
  delivered.

## 1. Navigation model

### 1.1 Layer-1 structure and order

The System Drawer presents two groups in this exact order:

```text
Today
Notes
Tasks
Documents

Settings

Return to reMarkable
```

`Today`, `Notes`, `Tasks`, and `Documents` are primary product destinations.
`Settings` is a secondary destination separated from the primary group by
whitespace or one `Ink30` divider. `Return to reMarkable` is a system transition
placed at the bottom of the drawer, separated from every navigation destination
by a divider and flexible space.

Inbox, Review, legacy System, More, and Home must not appear in the Drawer. Their
existing implementations may remain as internal migration routes for bridge or
rollback compatibility, but they are not user-visible Layer-1 destinations.

### 1.2 Home and Today merge

The current `HomePage.qml` and `TodayPage.qml` responsibilities merge into one
canonical user-facing route: **Today**. The merged page is not a dashboard and
does not preserve the old Home screen as a nested section.

The merged responsibilities are:

- from Home: current date/context and a quiet resume-first hierarchy;
- from Today: the real task read model and its divider-separated row language;
- from Notes: the most recent real notebook(s) for resume and recency;
- from Documents: only real document data, if a read model exists at
  implementation time.

Legacy `home` and `today` internal route requests must resolve to the same Today
page during migration. There must not be two mounted, independently stateful
copies of the merged page. The visible title and Drawer label are always
`Today`; user-facing `Home` copy is removed.

### 1.3 Default landing

After `PAPR.SYS.1` has successfully entered PaperOS and the shell is ready, the
default destination is Today. The UI does not own or describe the event that
caused entry. It only renders the landing page after the lifecycle owner reports
a usable shell state.

If a future lifecycle contract supplies a valid resume route, honoring it is a
separate product decision. Slice 2 does not invent resume-after-unlock,
persistent-watcher, or boot behavior. Without such a contract, the deterministic
fallback remains Today.

### 1.4 Drawer open and close rules

- The visible menu control on Layer-1 pages is the mandatory way to open the
  Drawer. An edge gesture may be retained only when already implemented and must
  never be the only entry.
- Opening and closing are discrete state changes. There is no slide, fade,
  translucent scrim, spring, or progress animation.
- The Drawer is a temporary surface above the current page. Opening it does not
  replace, reset, scroll, or reload the page beneath it.
- Tapping outside the panel closes it and performs no content action.
- Selecting any destination closes the Drawer, then navigates. Selecting the
  current destination only closes the Drawer and preserves page state.
- Back while the Drawer is open closes the Drawer first.
- The Drawer cannot open over a native ink session if doing so would violate the
  existing frozen-scenegraph/native-framebuffer boundary. Editor navigation
  continues to use the shipped native chrome contract.
- A failed or unavailable route leaves the user on the current page and exposes
  a static error message; it must not leave a blank page or an open half-state.

### 1.5 Current page indication

Exactly one Drawer destination is current. It uses `Ink100` text and Semibold
weight, optionally with the shipped short 2–4 px indicator. Other destinations
use `Ink70`. Current state is never shown with a full-row black fill; reverse fill
is reserved for the brief pressed state.

Nested states do not create extra Drawer items. Notes collections remain under
Notes; a notebook editor still maps to Notes; task detail maps to Tasks; a
document viewer maps to Documents; diagnostics maps to Settings.

### 1.6 Back behavior

Back is deterministic and never exits PaperOS:

1. If a temporary surface is open, Back dismisses that surface.
2. If a child/detail state is open, Back returns to its originating Layer-1
   page and restores the prior collection/scroll state where available.
3. Native editor Back uses the existing save/exit editor contract and returns
   to the originating Today or Notes context; Notes is the safe fallback when
   origin is unavailable.
4. On a Layer-1 root page, Back has no destructive effect. Implementations may
   return to Today from another root only if a platform Back event already
   requires handling; they must not quit the process.
5. Leaving PaperOS is possible only through the explicit `Return to reMarkable`
   lifecycle action.

### 1.7 Return to reMarkable

`Return to reMarkable` is the final fixed row at the bottom of the Drawer. It is
a **guarded system transition**, not destructive data deletion and not a normal
navigation destination. It uses normal `Ink70` treatment at rest, a temporary
pressed reverse state, a full 96 px hit row, and separation from Settings. Red,
warning cards, and a permanent black danger block are not used on monochrome
E Ink.

The row invokes the lifecycle contract owned by `PAPR.SYS.1`; QML must not
reimplement exit, stop services, start xochitl, call lifecycle scripts, or infer
recovery. If the lifecycle contract exposes a busy, failed, or unsaved state,
the UI renders that real state. Slice 2 does not fabricate a confirmation or a
success screen when the contract supplies no such state.

### 1.8 Why there is no fake Search

The current repository has no handwriting/title index, query contract, result
model, exact-page navigation, or hit geometry. A Search control would promise a
capability the system cannot fulfill and would add keyboard and refresh cost on
E Ink. Therefore production shows no Search affordance at all. Empty space is
not a visible reserved search slot. Search belongs to its later dedicated slice
after the data and navigation contracts exist.

## 2. Page responsibilities

### 2.1 Shared state policy

Every page follows the same truth hierarchy:

1. **Cache available:** keep real cached content visible during refresh or
   failure; add only a quiet state line when action is needed.
2. **Loading without cache:** show stable text/row placeholders with fixed
   geometry. No spinner animation or shimmer.
3. **Offline with cache:** content remains usable within already supported local
   capabilities; show `Offline · showing saved data` once near the bottom.
4. **Error with cache:** retain content and show a concise error plus Retry only
   when an existing retry contract is available.
5. **No cache:** state plainly that saved data is unavailable; never manufacture
   content or counts.
6. **Healthy:** hide sync status.

Loading, offline, and error are distinct. The interface must not use `offline`
as a generic label for every request failure.

### 2.2 Today

**Core task**

Resume the most relevant real notebook, scan today's real tasks, and reach recent
content in one quiet daily landing.

**First screen**

- Header: menu, localized current date/`Today`, and only contextually valid
  actions.
- `Continue writing`: at most one most-recent real notebook. Tap enters the
  existing native editor contract.
- `Recent notes`: at most two real paper thumbnails; `View all` opens Notes.
- `Tasks`: at most three real task rows; `View all` opens Tasks.
- `Documents`: at most two real rows only if a real read model exists. Otherwise
  this section is omitted, not replaced with examples.
- Exceptional offline/error state: one quiet bottom line after content.

Content is capped to preserve a one-glance landing. There is no nested scroll,
horizontal carousel, dashboard grid, analytics, recommendation feed, or large
outer card. If vertical space is constrained, preserve this priority order:
Continue writing, Tasks, Recent notes, Documents.

**Empty state**

- No notes: a light `Create a note` row using the existing safe quick-note flow;
  no template picker is added.
- No tasks: `Nothing scheduled today`, occupying one row rather than a card.
- No Documents capability: omit the section.
- All sections empty: retain the date and show the two truthful rows above; do
  not create a celebratory dashboard illustration.

**Offline state**

Render local notes and cached tasks normally. Disable or omit actions whose
existing contracts cannot operate offline. Show `Offline · showing saved data`.
Native note writing remains available under its shipped local contract.

**Loading state**

With cache, keep content visible. Without cache, reserve stable geometry for one
resume row and up to three task rows using `Ink30` rules and short labels such as
`Loading saved data…`; do not flash sections in and out.

**Error state**

Keep usable local/cached sections. Identify only the failed source; one failing
task fetch must not erase local notes. Offer Retry only through the existing
`ApiClient.fetchDashboard()` contract.

**Forbidden**

Search, fake documents, fake page counts, fake sync health, analytics, widgets,
task editing beyond the existing gated action contract, nested cards, template
selection, lifecycle actions, and infinite content.

### 2.3 Notes

**Core task**

Find, open, and create a real local notebook without regressing the shipped Notes
Gallery or native editor entry.

**First screen**

Preserve the two-column paper gallery and the existing truthful collections:
Recent, All, Folders, Favorites. The page header contains menu, `Notes`, and the
quiet add affordance. A paper thumbnail, title, and one metadata line form one
item; the item is not wrapped in a card.

Folders and Favorites may remain truthful empty collections while no backing
model exists. They must not display fabricated folders, badges, or counts.

**Empty state**

Recent/All: `No notes yet` plus `Create a note`. Folders: `No folders yet`.
Favorites: `No favorites yet`. Creation continues through the existing safe
quick-note path; templates are deferred.

**Offline state**

Local notes remain browsable, openable, and writable under the existing
NoteStore/native-ink contract. Remote sync health is not shown unless a real
pending or error state affects the visible item.

**Loading state**

`NoteStore.listNotes()` is local and synchronous in the inspected baseline.
Asynchronous thumbnail decode may show a Paper placeholder with stable size; no
spinner or animated skeleton is added.

**Error state**

A failed thumbnail shows a blank paper object and retains its real title and
metadata. A note-open failure stays in Gallery and presents a concise row-level
error; it does not navigate to an empty editor.

**Forbidden**

Search, OCR, tags, selection/batch mode, multi-page UI, page count invention,
templates, cloud-only badges, card footers, per-item More controls, and changes
to note storage format.

### 2.4 Tasks

**Core task**

Review today's real task list and use only actions already supported by the
current gated action queue. This is the full list destination for Today's task
preview; it does not absorb legacy Inbox or Review behavior in Slice 2.

**First screen**

Menu, `Tasks`, a short real focus/context line when available, followed by
divider-separated task rows. Preserve large checkbox targets and the existing
bounded pagination model when the list exceeds one screen. Task title is primary;
real priority/time/project metadata is secondary and omitted when absent.

Task action feedback must distinguish local queued/pending state from confirmed
server state. This IA does not enable production writes or change the action API.

**Empty state**

`Nothing scheduled today`. Do not display productivity scores, suggestions, or a
fake Add action.

**Offline state**

Show cached tasks with `Offline · showing saved data`. A write action is enabled
only if the existing queue contract already permits it and its pending state is
shown truthfully. The UI must not imply remote completion.

**Loading state**

With cache, retain rows. Without cache, show up to five stable blank row slots or
one `Loading tasks…` row. No shimmer and no changing row heights.

**Error state**

Retain cached rows and show the request failure at the bottom with an existing
Retry action. With no cache, show `Tasks unavailable` and no task controls.

**Forbidden**

New task creation, production write enablement, project management, calendar
editing, Review workflow, Inbox migration, drag gestures, optimistic server
success, periodic sync controls, and card-per-task presentation.

### 2.5 Documents

**Core task**

Provide the canonical Layer-1 destination for real readable documents without
pretending the current build has a document library.

**First screen**

Menu and `Documents`. If implementation discovery finds a real read model before
the QML gate, show unboxed rows containing document type, real title, and real
modified metadata. If no real model exists—as in the inspected Slice 1.1
baseline—show the truthful capability state `Documents are not available in this
build` with no list and no primary action.

This capability state is not equivalent to `No documents`: the UI cannot claim
an empty collection when it has no source capable of enumerating one.

**Empty state**

Only when a real model returns an empty collection: `No documents on this device`.
Import remains absent unless backed by an implemented contract in a later slice.

**Offline state**

Show locally available or cached documents only. Mark remote-only unavailable
items only if the data model truthfully exposes that state. Otherwise do not list
them.

**Loading state**

Show stable row placeholders only when a real asynchronous documents contract
exists. With no contract, use the capability state and do not simulate loading.

**Error state**

Keep cached/local rows and identify the failed source. Without cache, show
`Documents unavailable` and a Retry action only when the source contract provides
one.

**Forbidden**

Fake PDFs, sample filenames, inferred imports, document creation, xochitl store
mutation, file-system scanning added by QML, OCR, Search, sharing, export, and
production API changes.

### 2.6 Settings

**Core task**

Inspect and adjust only settings and device information backed by current UI
contracts, while keeping lifecycle controls in their owning system track.

**First screen**

Menu and `Settings`, followed by restrained divider-separated sections. Slice 2
may preserve the current read-only device status, refresh mode, diagnostics, and
existing manual dashboard Retry/Sync action. Healthy sync status is hidden.
`Return to reMarkable` is not duplicated here; its canonical location is the
Drawer footer.

Settings must not expose Sleep, Wake, Restart PaperOS, Restart device, Shut down,
Launch after unlock, auto-sleep, timer cadence, or lifecycle state until the
owning contract is delivered and a later UI scope is authorized.

**Empty state**

Settings as a whole has no generic empty state. An unavailable individual value
uses `Unknown` or `Unavailable` beside its label, based on the real provider.

**Offline state**

Local device settings and status remain available. Network-dependent actions
identify offline state locally and do not block the page.

**Loading state**

Keep section geometry stable and use `Checking…` only for values actively being
read. No progress animation.

**Error state**

Show the failed value or operation inline. A failed setting must not blank the
whole page. Retry is scoped to the failing provider.

**Forbidden**

Unimplemented lifecycle settings, fake battery/Wi-Fi values, persistent watcher,
sleep/wake policy, sync timer, wake reconciliation, production credentials,
developer raw errors on the first screen, and duplicate exit actions.

## 3. Paper-first interaction rules

### 3.1 Canvas first

- The page background is the primary surface; content is not placed inside a
  full-screen container card.
- Hierarchy uses whitespace, type size/weight, alignment, and at most `Ink30`
  dividers before adding a border.
- Notes and documents read as paper objects. Tasks read as lines on a page.
- The native editor remains near edge-to-edge and is outside the visual
  redesign scope of Slice 2.

### 3.2 Temporary system surfaces

The System Drawer and error/confirmation surfaces exist only while needed and
leave the previous content state intact. No permanent navigation rail, bottom
tab bar, translucent scrim, nested modal, or full-page More hub is introduced.

### 3.3 Shape and web-app avoidance

- Normal content groups and rows use 0 px radius and no enclosing border.
- Paper thumbnails may use 2–4 px radius with no border by default.
- Buttons use radius only when the control needs a boundary; a whole section is
  never rounded to create hierarchy.
- No shadows, blur, glass, gradients, avatar/header chrome, pill navigation,
  card grid, or card-inside-card composition.

### 3.4 E Ink refresh boundaries

| Event | Required visual update | Forbidden update |
| --- | --- | --- |
| Drawer open | drawer rectangle and exposed boundary; one discrete repaint | animated sweep or repeated whole-screen frames |
| Drawer close | restore drawer region; request one quality refresh if ghosting requires it | fade/scrim cleanup sequence |
| Destination change | new page as one stable composition | progressive card entrance |
| Row press/current change | target row/hit region only | full-page refresh per press |
| Loading to content | changed rows/sections with stable geometry | shimmer or spinner frames |
| Error/offline line | status-line region only | replacing healthy content |
| Pen down/up | preserve shipped native ink dirty-region policy | QML repaint or full refresh during pen-down |

Large surface closure and page changes may use the existing refresh coordinator;
this spec does not add a new refresh engine or native framebuffer behavior.

### 3.5 Motion

No interaction in Slice 2 requires animation. Pressed, current, selected,
loading, and open/closed states change discretely. Time-based opacity, position,
scale, shimmer, spring, elastic scroll, and indeterminate progress are forbidden.

### 3.6 Touch targets

- Drawer row: 96 px high.
- Normal icon: 28–36 px visible glyph in an 88 × 88 px hit box.
- Header/menu/add/back action: at least 88 × 88 px hit box.
- Task checkbox/status control: 28–36 px visible, 72–88 px hit box.
- Normal list row: at least 88 px high.
- Focus outline is 1–2 px `Ink100`; visual glyph size never substitutes for the
  hit target.

### 3.7 Keyboard, pen, and touch roles

| Input | Role in Slice 2 |
| --- | --- |
| Pen | Writes/selects only inside the shipped native editor contract. On Layer-1 pages it may activate a control only if the platform already treats it as a pointer; no pen-first hidden gesture is added. |
| Touch | Primary navigation: open/close Drawer, open rows, change Notes collection, use visible controls, and scroll bounded lists. Finger never writes ink. |
| Keyboard | Optional focus traversal and activation for visible controls when hardware/test input exists. There is no Search text field and no desktop-only shortcut hint. Focus order follows screen order, then Drawer order. |

Every gesture has a visible alternative. Palm contact must not open the Drawer,
navigate, or alter content while native ink owns input.

### 3.8 Drawer/content visual relationship

The Drawer is an opaque Paper surface above the unchanged page. One 1–2 px
`Ink70`/`Ink100` edge defines the boundary. There is no transparency. The page
beneath remains visible outside the panel but receives no input until the Drawer
closes. Drawer width and row rhythm should preserve the shipped System Drawer
proportions unless device evidence proves a correction is necessary.

### 3.9 Mixed Chinese/English text

- Use the shipped CJK-capable sans-serif family and fallbacks; never render one
  language with a visibly unrelated system font.
- Allow Chinese and English page/row titles to wrap to two lines without
  clipping; metadata remains one line with safe elision.
- Do not use letter-spaced all-caps for translated section headings.
- Dates use locale output; route identity and semantic IDs never derive from
  translated labels.
- Acceptance strings must include mixed content such as
  `今天 · Project 复盘` and `设计评审 Design review`.

## 4. System boundaries

```text
PAPR.UI.2 owns:
- navigation
- page IA
- visual hierarchy
- UI states

PAPR.SYS.1 owns:
- enter
- exit
- restart
- recover
- lifecycle state

PAPR.SYS.2 owns:
- sleep
- wake
- idle

PAPR.SYNC.6 owns:
- periodic sync
- wake reconciliation
```

Boundary rules:

- UI calls a lifecycle interface and renders only states that interface exposes.
  It does not call systemd, shell scripts, xochitl, or device services directly.
- `Return to reMarkable` remains a UI affordance for `PAPR.SYS.1`'s exit
  contract; the label is not evidence that exit/recovery has passed.
- Settings does not preview future lifecycle controls as disabled rows.
- Slice 2 may show current cached/offline/error data state, but it does not add a
  timer, watcher, wake reconciliation, or a new sync scheduler.
- No lifecycle capability is marked available, successful, or device-PASS from
  this design-only deliverable.

## 5. Implementation map

Paths below were verified against the committed Slice 1.1 tree at `d7c52858`.
Rows marked **proposed new** do not exist in that tree; their location follows
the existing QML module directory and the execution SSOT. This is a map for the
later implementation session, not authorization to modify these files now.

| File | Current responsibility | Proposed Slice 2 responsibility | Risk | Dependency |
| --- | --- | --- | --- | --- |
| `apps/planner-device/remarkable-lite/qml/Main.qml` | Integer `currentModule`, seven mounted legacy pages, shell header, Drawer host, Notes add action, native ink cover | Default to canonical Today; mount one merged Today; add Tasks/Documents roots; remove user-facing Home action and duplicate legacy pages from visible navigation; preserve native ink/root bridge properties | **High** — route index and semantic bridge regression | Slice 1.1 owner re-verification; route migration plan; `TestBridge` updates |
| `apps/planner-device/remarkable-lite/qml/SystemDrawer.qml` | Temporary Drawer with Home, Today, Notes, Inbox, Review, System and direct `Qt.quit()` exit | Exact final order: Today, Notes, Tasks, Documents / Settings / Return; canonical current state; lifecycle-contract invocation instead of owning exit behavior | **High** — lifecycle boundary and Drawer regression | `PAPR.SYS.1` exit interface; final route IDs |
| `apps/planner-device/remarkable-lite/qml/HomePage.qml` | Clock, NOW, FOCUS, open-loop summary, always-visible status footer | Legacy source only; extract useful date/context logic into merged Today, then stop mounting as an independent page | Medium — duplicated timers/state if left mounted | `HomeTodayPage.qml`; `ApiClient` truth model |
| `apps/planner-device/remarkable-lite/qml/TodayPage.qml` | Five-item real task list, local pending actions, pagination, status footer | Legacy source only; extract task-list behavior into Tasks and a capped read-only preview into Today; stop mounting as duplicate Today | **High** — action queue semantics and optimistic state | `TasksPage.qml`; existing `ActionQueue`; write gate remains unchanged |
| `apps/planner-device/remarkable-lite/qml/HomeTodayPage.qml` (**proposed new**) | Does not exist in committed baseline | Single canonical Today landing: date, Continue writing, up to two Recent notes, up to three Tasks, conditional Documents, exceptional status line | **High** — mixed local/remote state and first-screen density | `NoteStore.listNotes()`; `ApiClient.dashboardData`; optional real Documents model |
| `apps/planner-device/remarkable-lite/qml/TasksPage.qml` (**proposed new**) | Does not exist in committed baseline | Full Tasks destination extracted from current `TodayPage.qml`; truthful queued/pending state and bounded pagination | Medium | Existing `ActionQueue` and `ApiClient`; no production-write change |
| `apps/planner-device/remarkable-lite/qml/DocumentsPage.qml` (**proposed new**) | Does not exist in committed baseline | Real document rows if a contract exists; otherwise truthful capability state with no fabricated list/action | Medium — pressure to fake content | Separate real read-model decision; no QML filesystem scan |
| `apps/planner-device/remarkable-lite/qml/NotesPage.qml` | Shipped two-column Gallery; Recent/All plus truthful empty Folders/Favorites; native editor entry | Preserve Gallery; expose reusable recent-note presentation/data selection to Today without duplicating storage logic | **High** — shipped visual and note-open regression | Slice 1.1 device PASS; `NoteStore` contract unchanged |
| `apps/planner-device/remarkable-lite/qml/SystemPage.qml` | System label; manual sync, refresh mode, device status, diagnostics, duplicate Return action | User-facing Settings; retain only backed settings/status; hide healthy sync; remove duplicate Return and all unimplemented lifecycle controls | Medium — accidental ownership of SYS.1/SYS.2/SYNC.6 | Existing providers; later lifecycle UI explicitly out of scope |
| `apps/planner-device/remarkable-lite/qml/InboxPage.qml` | Mail/inbox aggregation and action conversion | Retain internal legacy route only; not mounted as primary navigation and not merged into Tasks in Slice 2 | Low if isolated; high if deleted | Bridge/rollback audit |
| `apps/planner-device/remarkable-lite/qml/ReviewPage.qml` | Daily shutdown/review flow | Retain internal legacy route only; not visible and not merged into Tasks in Slice 2 | Low if isolated; high if deleted | Bridge/rollback audit |
| `apps/planner-device/remarkable-lite/qml/MorePage.qml` | Legacy secondary navigation hub and duplicate Return action | Remove from user-visible route graph; retain only if rollback/test compatibility requires it | Medium | Test scenario migration |
| `apps/planner-device/remarkable-lite/qml/StatusLine.qml` | Shared label/value row for settings | Continue as unboxed Settings/status primitive; support truthful unknown/error copy without new state ownership | Low | Existing providers |
| `apps/planner-device/remarkable-lite/qml/PaperButton.qml` | Shared outlined/selected button | Reuse only for true actions; do not turn section links or Drawer rows into buttons/cards | Medium — broad visual regression if globally changed | Slice 1.1 visual tokens |
| `apps/planner-device/remarkable-lite/CMakeLists.txt` | Registers existing QML module files | Register only approved new QML files after the implementation gate | Low | Final file selection |
| `apps/planner-device/remarkable-lite/src/TestBridge.cpp` and `.h` | Semantic tree/tap/state/screenshot bridge; understands current module/editor state | Add final route/state semantics and validate visibility; migrate captures from visible Home to visible Today without coordinate taps | **High** — deterministic gate coverage | Final semantic ID table and screenshot runner |
| `apps/planner-device/remarkable-lite/src/NoteStore.cpp` and `.h` | Local note create/list; single page; Gallery fields and preview URLs | Expected dependency only. Reuse `listNotes()` for Continue/Recent; do not change format, writes, page count, or migration | **High** if modified; otherwise low | Core Slice 1 storage contract |
| `apps/planner-device/remarkable-lite/src/ApiClient.cpp` and `.h` | Dashboard fetch/cache plus loading/error/lastSync | Expected dependency only. Supply real tasks and current cache states; no production API or periodic-sync change | **High** if modified; otherwise low | Current production-read contract; `PAPR.SYNC.6` owns scheduling |
| `apps/planner-device/remarkable-lite/src/InkModeController.cpp` and `.h` | Native editor entry/exit, tools/chrome, framebuffer state | No planned Slice 2 change; regression boundary only | **Critical** | Slice 1.1 owner device re-verification |

### 5.1 Route migration contract

The current public behavior uses integer modules. The implementation may retain
that mechanism, but user-visible identity and tests must use semantic routes.
The safest bounded migration is:

| Current route | Slice 2 resolution | Visibility |
| --- | --- | --- |
| Home | redirect/alias to canonical Today | no Home label or independent page |
| Today | canonical Today | Drawer primary; default |
| Notes/Write | Notes | Drawer primary |
| Inbox | unchanged legacy page | internal only |
| Review | unchanged legacy page | internal only |
| System | canonical Settings alias | Drawer secondary as Settings |
| More | no user destination | internal only if still required |
| Tasks | new canonical destination | Drawer primary |
| Documents | new canonical destination | Drawer primary |

Route indices must not appear in copy, semantic IDs, or tests. The implementation
plan must explicitly update every `objectName`, TestBridge assertion, and capture
scenario affected by removal of visible Home. No coordinate fallback is allowed.

### 5.2 Required semantic IDs

Names may be added without deriving them from translated labels:

```text
shell.menu
system.drawer
shell.closed
drawer.today
drawer.notes
drawer.tasks
drawer.documents
drawer.settings
drawer.exit
page.today
page.notes
page.tasks
page.documents
page.settings
today.continue
today.notes.viewAll
today.tasks.viewAll
today.documents.viewAll       # only visible with a real model
```

Existing `notes.collection.*`, `notes.item.<opaque-note-id>`, `editor.clean`,
`editor.chrome.handle`, `editor.tools.revealed`, and `editor.after-writing`
contracts remain regression requirements.

## 6. Acceptance matrix

All rows are implementation acceptance criteria. This design document can mark
their specification status complete, but it cannot mark device execution PASS.

| ID | Acceptance | Required evidence | Failure condition |
| --- | --- | --- | --- |
| IA-01 | Home is not an independent repeated page | Drawer capture + semantic tree + route assertions | Home label, page, or separate state remains user-visible |
| IA-02 | Today is the default entry | cold shell route assertion after lifecycle-ready state | shell defaults to another destination or UI claims how entry occurred |
| IA-03 | Drawer order is exact | semantic tree and `system.drawer` capture | any missing, added, reordered, or legacy visible item |
| IA-04 | No fake Search | source scan + all Slice 2 captures | visible Search field/icon/disabled row/placeholder without capability |
| IA-05 | Notes Gallery does not regress | existing Recent/All/open-note captures and visual delta | cards/borders return, collections or note-open contract break |
| IA-06 | System Drawer does not regress | menu, outside-tap, current-item, close-after-nav assertions | permanent rail, animation, scrim, lost outside close, heavy active block |
| IA-07 | Return to reMarkable uses lifecycle contract | interface-level assertion supplied by `PAPR.SYS.1` owner | direct lifecycle script/systemd/xochitl logic in QML, or visual success without contract |
| IA-08 | Offline/cache states are clear | Today, Tasks, Documents state fixtures: cached offline, no cache, source error | cached content disappears, generic `offline` masks errors, healthy sync persists |
| IA-09 | Chinese/English mixed text is safe | captures with `今天 · Project 复盘` and `设计评审 Design review` | tofu, clipping, unsafe semantic IDs, translated route mismatch |
| IA-10 | E Ink uses no animation | source scan and device observation | animation, shimmer, fade, slide, spring, elastic behavior |
| IA-11 | Toolbar and ink chrome do not regress | Slice 1.1 focused captures + owner physical tool/color gate | stale tool/color, changed native rail behavior, scenegraph repaint in ink mode |
| IA-12 | Today uses only real content | populated/empty captures plus source fixture trace | sample note/task/document/count/sync data appears |
| IA-13 | Documents is truthful without a read model | no-model capability-state capture | fake list, false empty-collection claim, QML filesystem scan |
| IA-14 | Current page is singular and legible | each Drawer destination capture | zero or multiple current rows, black full-row current fill |
| IA-15 | Back never exits PaperOS | surface/detail/root route assertions | Back quits, invokes recovery, or skips editor exit contract |
| IA-16 | Hit targets meet baseline | component geometry assertions + touch QA | Drawer/header <88–96 px, checkbox target <72 px |
| IA-17 | Production/write scope is unchanged | diff audit | API change, write enablement, new mutation, optimistic remote success |
| IA-18 | Lifecycle/sync tracks remain isolated | diff and copy scan | SYS.2, watcher, launch-after-unlock, timer, wake reconciliation enters diff |

### 6.1 Focused implementation screenshot set

The later implementation gate should add these deterministic captures without
replacing the existing Core Slice 1/1.1 evidence:

```text
20-today-populated.png
21-today-empty.png
22-today-offline-cache.png
23-today-no-cache.png
24-tasks-populated.png
25-documents-capability-unavailable.png
26-settings.png
27-system-drawer-final-ia.png
28-today-mixed-cjk-en.png
```

If a real Documents model exists by implementation time, add populated, empty,
offline-cache, and error captures; do not replace the capability-unavailable
fixture without documenting the contract that made it obsolete.

## 7. Dependency and release gate

```text
IA status may become DESIGN-READY.

QML implementation must wait for:
- Slice 1.1 owner device re-verification
- PAPR.SYS.1 deployment integration closure

Device merge must not bypass PAPR.SYS.1.
```

Interpretation:

- This document may merge as a docs-only DESIGN-READY artifact.
- No QML implementation begins from this branch/session.
- Slice 1.1 owner re-verification must cover toolbar/tool/color behavior,
  Gallery cleanup, System Drawer cleanup, and recovery.
- `PAPR.SYS.1` must close deployment integration and provide the lifecycle
  contract used by `Return to reMarkable` before the Slice 2 QML gate.
- `PAPR.SYS.2` remains not started. `PAPR.SYNC.6` remains blocked on its owning
  dependencies. Neither is advanced by this specification.
- A successful build, screenshot batch, or design review does not authorize a
  device merge and must not be reported as a Slice 2 device PASS.

## 8. Implementation blockers and handoff checklist

The IA is design-ready. Implementation remains blocked by external gates, not by
an unresolved IA choice.

Before implementation:

- [ ] Slice 1.1 owner device re-verification is recorded PASS.
- [ ] `PAPR.SYS.1` deployment integration is closed and its exit interface is
      documented for UI consumers.
- [ ] The implementation owner rebases on the accepted Slice 1.1 commit and
      confirms no competing uncommitted QML work is used as a source of truth.
- [ ] Documents capability is re-inspected. If no real read model exists, retain
      the specified capability-unavailable page and hide Today's Documents
      section.
- [ ] Final semantic routes/object names and TestBridge migration are included in
      the implementation plan before code changes.
- [ ] Existing Notes Gallery, System Drawer, native ink, toolbar, mixed-CJK, and
      recovery gates remain in the release matrix.

## 9. Design-ready verdict

`PAPR.UI.2` has a complete navigation model, page responsibilities, state model,
paper-first interaction rules, ownership boundaries, verified implementation
map, acceptance matrix, and dependency gate. Its specification status is:

```text
PAPR.UI.2 IA DESIGN-READY
```

This is not QML-complete, implementation-ready-to-merge, or device-PASS.
