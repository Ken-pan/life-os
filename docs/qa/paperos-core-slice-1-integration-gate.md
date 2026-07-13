# PaperOS P-MOVE-UI Core Slice 1 — Technical Integration Gate

**Date:** 2026-07-10
**Status:** Core Slice 1 shipped on device; **Slice 1.1** is the active correction pass
**Next execution SSOT:** [`paperos-next-ui-update-guide.md`](./paperos-next-ui-update-guide.md)
**Scope:** shell/drawer, Notes Gallery, and native editor visual chrome only. This is a technical gate, not a design review.

## 1. Current technical baseline

### Reproducible device loop

```sh
# Build (requires the licensed reMarkable SDK installer in docker/sdk-installer/).
apps/planner-device/remarkable-lite/scripts/build-remarkable.sh

# Ship only the candidate binary, then promote and run it under the recovery-aware service.
apps/planner-device/remarkable-lite/scripts/paperctl deploy shell --promote-shell --restart

# Debug-shell route and capture session; do not use this for a production write test.
apps/planner-device/remarkable-lite/scripts/paperctl start
apps/planner-device/remarkable-lite/scripts/paperctl doctor

# Always restore the stock display owner at the end of a debug session.
apps/planner-device/remarkable-lite/scripts/paperctl recover
```

`paperctl deploy` copies to a temporary path and renames it, backs up the currently promoted shell, installs the launcher unit, and starts exactly one display owner. `build-remarkable.sh` uses the Dockerized vendor toolchain; it is the repeatable build command, not an assertion that the panel is correct.

### Live preflight and route result (2026-07-10)

`paperctl doctor` passed against `remarkable-pro-move`:

| Check | Result |
| --- | --- |
| host / architecture | `imx93-chiappa` / `aarch64` |
| local shell artifact | present (6873 KiB) |
| deployed shell | `0db5d9bd677e` |
| bridge | reachable; initial page `today` |
| storage reported by doctor | 88 MiB free on `/` |
| normal recovery | `xochitl=active` after `paperctl recover` |

Verified semantic routes, in their valid context: `nav.home`, `nav.today`, `nav.write`, `nav.more`, then `more.inbox`. The current bridge does not reject a hidden item: tapping `more.review` or `more.system` while still on Inbox returns transport success but does not navigate. The correct legacy route is `nav.more` → `more.review` / `more.system`.

`scenarios/navigation-core.json` is presently invalid: it names `nav.inbox`, which is not an `objectName`; Inbox is only reachable as `more.inbox`. Do not use that scenario as gate evidence until it is repaired separately.

### Current native ink and recovery invariants

Keep these properties while Fable changes UI:

- `InkModeController` waits for the static QML cover, reuses the shell process's resolved vendor framebuffer, grabs the Marker evdev device, and sends `QualityFastest` partial live swaps through the serialized `DisplayScheduler`.
- The QML cover consumes touch while `nativeInkActive`; QML must never draw or handle pen input during a native session.
- The current controller has exactly one active note and one physical page (`page-001.png`), restores that bitmap before drawing chrome, and saves it only on a normal `leave(0)` after evdev started.
- Native exit clears scheduler callbacks, releases `EVIOCGRAB`, hides the cover, then asks the shell for a complete repaint. Launcher/service cleanup restores xochitl when the shell exits or crashes.
- The current implementation is **not** the target `paperos-core` + separate `QCoreApplication` ink runtime architecture described in `PRO_MOVE_NATIVE_INK_RUNTIME_ARCHITECTURE.md`. It is an in-process takeover chosen to avoid the vendor framebuffer lock. Do not represent it as crash-isolated.

Known recovery limits that must not be masked: `savePage()` directly overwrites `page-001.png` and is not atomic; a runtime crash loses uncommitted ink; stroke JSONL and the rendered PNG are not transactionally coupled. These are existing limitations, not permission to weaken recovery further.

## 2. QML / C++ ownership boundary

Fable owns presentation and navigation state in the following surfaces:

- `qml/Main.qml`: shell/drawer/route-stack and shell overlay visual state.
- `qml/NotesPage.qml`: gallery presentation, Recent/All selection and read-only item routing.
- Native editor visual chrome requested by the slice: the visual arrangement and semantic UI state, with the raster implementation remaining in `src/InkModeController.cpp`.

Fable must preserve this QML-to-C++ API boundary:

| Producer | Stable contract | Consumer |
| --- | --- | --- |
| `NoteStore` | `createNote(kind)`, `listNotes()`, `noteCount`; current list fields `noteId`, `displayTitle`, `modifiedAt`, `modifiedLabel`, `hasInk`, `pageCount`, `previewUrl` | gallery QML |
| `InkModeController` | `enter(noteId)`, `exit()`, properties `active`, `noteId`, `tool`, `color`, signal `exited(code)` | gallery/shell QML |
| `Main.qml` | root properties `currentModule`, `nativeInkActive`, `nativeInkNoteId`, `nativeInkTool`, `nativeInkColor`; invokable `exitNativeInk()` | `TestBridge` |
| `TestBridge` | `state`, `tree`, `tap(id)`, `screenshot(path)`, `ink-exit` | `paperctl` |

Do not make QML write notebook files, replace `inkMode.enter()` with a QML canvas, use coordinate-driven test navigation, or remove the root properties above while the bridge depends on them. Any new page/chrome state must be exposed through `objectName`, not inferred from a label or pixel position.

### Required post-Fable semantic IDs

The following names are the Core Slice 1 integration contract. They are intentionally not product copy and do not prescribe the design.

| Capture | Required visible target(s) |
| --- | --- |
| shell closed | `nav.home`, `shell.closed`, `shell.menu` |
| system drawer | `shell.menu`, `system.drawer`, `drawer.notes` |
| Notes Recent | `notes.collection.recent` |
| Notes All | `notes.collection.all` |
| notebook opened | `notes.item.<opaque-note-id>`, `editor.clean` |
| editor tools | `editor.chrome.handle`, `editor.tools.revealed` |
| after writing | `editor.fixture.after-writing`, `editor.after-writing` |

`notes.item.<opaque-note-id>` is discovered from the live bridge tree. The runner never fabricates a note ID or a page count. `editor.fixture.after-writing` must select a pre-seeded, **read-only visual fixture**; it must not create, mutate, or persist a note.

## 3. Deterministic screenshot batch

The runner is [`capture-ui-core-slice-1.sh`](../../apps/planner-device/remarkable-lite/scripts/capture-ui-core-slice-1.sh). It is fail-closed: absent, invisible, or renamed semantic IDs cause a failure instead of a coordinate guess.

```sh
# after the Fable slice is built, deployed, and started with PAPEROS_TEST_BRIDGE=1
apps/planner-device/remarkable-lite/scripts/capture-ui-core-slice-1.sh \
  docs/ui-qa-screenshots/paperos/device/latest

# restore xochitl regardless of pass/fail
apps/planner-device/remarkable-lite/scripts/paperctl recover
```

| File | Route / assertion | Current baseline status |
| --- | --- | --- |
| `01-shell-closed.png` | `nav.home` → `shell.closed` | unavailable; current app has permanent tabs |
| `02-system-drawer-open.png` | `shell.menu` → `system.drawer` | unavailable |
| `03-notes-recent.png` | `drawer.notes` → Recent | partial legacy gallery only |
| `04-notes-all.png` | `notes.collection.all` | partial legacy gallery only |
| `05-notebook-opened.png` | first visible `notes.item.*` → `editor.clean` | unavailable as an asserted editor state |
| `06-editor-clean.png` | `editor.clean` | unavailable |
| `07-editor-tools-revealed.png` | handle → tools revealed | unavailable; native rail is always visible |
| `08-editor-after-writing.png` | read-only fixture → after-writing | unavailable; bridge `stroke` is explicitly TODO |

The requested batch cannot truthfully pass on the baseline. In particular, `paperctl stroke` is a no-op, and entering the existing ink controller then exiting can overwrite `page-001.png`; the gate deliberately does neither.

## 4. Bounded multi-page NoteStore data-contract proposal (not implemented)

This proposal changes no production format and supplies no Page Overview UI. It is bounded to notebook/page identity, ordering, CRUD semantics, migration, and recovery.

### 4.1 Canonical objects

Each notebook remains one directory under `data/notes/<notebookId>/`. Existing `note-YYYYMMDD-HHMMSS` IDs remain valid; new IDs should be opaque, collision-resistant IDs generated by the core, never display titles.

```text
data/notes/
  <notebookId>/
    meta.json                    # notebook metadata, schemaVersion=2
    pages.json                   # ordered page manifest, schemaVersion=1
    pages/
      <pageId>/
        page.png                 # rendered recovery snapshot
        strokes.jsonl            # canonical strokes once core owns persistence
        thumbnail.png            # derived, replaceable
```

`meta.json` is notebook identity and metadata only: `{ notebookId, title, kind, createdAt, updatedAt, schemaVersion }`. It contains no page count. `pages.json` is the sole ordering authority: `{ notebookId, revision, pageIds: ["<opaque-pageId>"] }`. A page ID is immutable and never derived from a page number. The gallery derives `pageCount` from `pageIds.length`; it must not hard-code or invent one.

### 4.2 Operations and atomic boundary

| Operation | Required result | Commit rule |
| --- | --- | --- |
| create notebook | directory, metadata, and one blank opaque page ID | create in a sibling staging directory; fsync files; rename directory; fsync parent |
| create page | new page directory and one appended page ID | create page data first; atomically replace `pages.json` with incremented revision |
| duplicate page | new page ID and copied canonical content; source remains unchanged | copy into staging page directory; publish page; then atomically publish manifest |
| move/reorder within notebook | only `pages.json` order changes | compare revision; atomically replace manifest; never renumber IDs |
| move/copy between notebooks | source and destination manifests change together or recoverably | journal intent under `data/notes/.txn/`, stage destination, publish both manifests with operation ID, remove journal only after both durable |
| delete page/notebook | no immediate irreversible deletion | atomically move to same-filesystem trash with tombstone metadata; manifest removal is committed in the same journaled operation |

The API should return structured results, e.g. `{ ok, notebookId, pageId, revision }` or `{ ok: false, code: "stale-revision" | "not-found" | "io" }`. QML must request operations; it must not construct paths or perform a write itself.

### 4.3 Migration from `page-001.png`

Migration is lazy, idempotent, and read-compatible:

1. Detect a notebook without `pages.json` that contains legacy `page-001.png` and/or `page-001.strokes.jsonl`.
2. Allocate one stable migration page ID (persist it in the transaction before publishing). Do not use a visible count or manufacture additional pages.
3. Copy legacy assets to the new page staging directory, preserving bytes and timestamps where possible; write the new metadata/manifest; atomically publish.
4. Retain the legacy files until a verified migration marker and a rollback window exist. Readers accept the legacy layout until migration has committed.
5. If any step is interrupted, leave the legacy notebook readable and either resume or discard only its unreferenced staging data.

No automatic production migration runs as part of Core Slice 1. Migration needs an explicit later gate with device free-space checks; the current doctor reports only 88 MiB free on `/`.

### 4.4 Crash safety and ink invariants

Core owns the only canonical writer. Stroke persistence uses append/commit semantics, a durable per-stroke checkpoint, atomic manifest replacement, file `fsync`, and parent-directory `fsync` after rename. Rendered PNGs and thumbnails are derived recovery artifacts: write them as temp files and atomically replace; a failed thumbnail must never invalidate canonical strokes or a prior snapshot.

On startup, recovery replays journals: complete an operation only when its manifest revisions and data hashes match; otherwise restore the previous manifest and retain evidence for diagnosis. A runtime crash may lose only the currently live, uncommitted stroke—not an already committed page, page order, source page of a duplicate/move, or trash tombstone.

The current direct `page-001.png` overwrite does not meet this proposal. It remains untouched for this slice to avoid a format change before the dedicated persistence/recovery gate.

## 5. Exact post-Fable isolated-worktree device procedure

1. Confirm Fable has committed a branch and that its changes are limited to the agreed UI slice. Do not integrate from a dirty shared worktree.
2. Create an isolated worktree from the Fable commit, e.g. `git worktree add ../life-os-paperos-ui-gate -b codex/p-move-ui-core-slice-1-gate <fable-commit>`; apply only the required integration commit(s) there.
3. In that worktree, review `git diff --check`, verify the QML/C++ boundary and required `objectName` contract above, and confirm no change creates production note writes or changes the note format.
4. Build with `apps/planner-device/remarkable-lite/scripts/build-remarkable.sh`. Record the build artifact SHA; a successful build advances only to device test.
5. Wake the Move, run `paperctl doctor`, then deploy the shell with `paperctl deploy shell --promote-shell --restart`. Record the promoted SHA and confirm one display owner (`paperos=active`, `xochitl=inactive`).
6. Start the debug bridge with `paperctl start`, run the screenshot batch, and retain its eight named captures. The test fixture must be read-only. On failure, capture `paperctl state`, `tree`, and `logs`; do not guess taps or patch the device in place.
7. Run the physical-device ink gate separately: clean entry/exit, Marker input, first/fast stroke continuity, no full refresh during pen-down, and recovery to xochitl after controlled stop/crash. A screenshot is not evidence of latency or panel behavior.
8. Run `paperctl recover`, verify `xochitl=active`, then run `paperctl doctor`. Only then report the device gate result. Do not enable production writes, Page Overview, or the multi-page migration in this procedure.

## 6. Blockers separated from product findings

### Technical blockers

- Required Core Slice 1 semantic IDs and state assertions do not exist in the deployed baseline.
- `TestBridge` reports successful taps even for hidden objects and cannot assert overlay/chrome state; the required visible IDs make this observable until bridge validation is hardened.
- `paperctl stroke` is a no-op, so an automated “after writing” capture requires the specified read-only fixture rather than fake ink.
- Current NoteStore is single-page; its PNG write is non-atomic and cannot safely support multi-page CRUD yet.
- The current ink takeover is in-process, not the target crash-isolated runtime. Native latency and recovery need physical-device evidence, not build output.
- Device root storage is low (88 MiB reported); avoid migration copies and unbounded screenshot/log accumulation there.

### Product-design findings (not blockers for this technical gate)

- Current permanent tabs, More hub, fixed editor rail, gallery labels, and page-count layout differ from the UX brief.
- The brief's Page Overview, template picker, global search, selection modes, and visual-token work remain product scope and are explicitly out of this gate.
