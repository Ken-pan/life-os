# PaperOS Native Ink Runtime Architecture

**Status:** target architecture after rejecting the Qt Quick hybrid ink path.  
**Goal:** PaperOS Notes enters a full-takeover native ink mode with xochitl-like
latency while preserving a seamless PaperOS navigation experience.

## Components

```text
paperos-shell
paperos-core
paperos-ink-runtime
```

### paperos-shell

Qt Quick shell for non-canvas UI:

- Notes list
- Planner
- Tasks
- Settings
- Navigation
- Search

It does not own canonical stroke data. It requests note sessions through core
and freezes/restores navigation state around native note mode.

### paperos-core

Resident state and persistence service:

- current note/session
- canonical stroke model
- JSONL append/save
- undo/redo model
- note metadata
- thumbnail generation queue
- sync queue
- crash recovery
- IPC API

Core is the single writer for canonical data. Display surfaces only render or
submit stroke deltas.

### paperos-ink-runtime

Native takeover canvas:

- `QCoreApplication` only
- no QML
- no `QQuickWindow`
- no Qt Scene Graph
- xochitl stopped while active
- exclusive vendor framebuffer ownership
- raw Marker evdev
- continuous CPU raster
- one serialized display scheduler
- PaperOS toolbar rendered directly into framebuffer

## IPC Contract

Transport is intentionally unspecified until the first on-device prototype
chooses the safest local primitive. The command model is stable:

```text
OPEN_NOTE { noteId, routeSnapshot, pageIndex }
NOTE_READY { noteId, pageIndex, framebufferReady }
APPEND_STROKE_POINTS { noteId, pageIndex, strokeId, points[] }
COMMIT_STROKE { noteId, pageIndex, strokeId }
UNDO { noteId, pageIndex }
REDO { noteId, pageIndex }
EXPORT_THUMBNAIL { noteId, pageIndex }
CLOSE_NOTE { noteId, reason }
NOTE_CLOSED { noteId, persisted, thumbnailPath }
RUNTIME_CRASHED { noteId, lastCommittedStrokeId }
```

Stroke point shape:

```json
{
  "x": 123,
  "y": 456,
  "p": 0.72,
  "t": 1783650000000
}
```

The runtime may keep a transient live stroke buffer, but a stroke becomes
canonical only after core accepts `COMMIT_STROKE`.

## Enter State Machine

```text
shell Notes route
  -> shell sends OPEN_NOTE(noteId) to core
  -> core creates or resumes session
  -> shell freezes route/navigation snapshot
  -> shell releases display ownership
  -> supervisor starts or wakes ink-runtime
  -> ink-runtime acquires framebuffer
  -> ink-runtime restores note pixels from core snapshot
  -> ink-runtime draws toolbar
  -> NOTE_READY
  -> Marker input active
```

## Exit State Machine

```text
Back command inside ink-runtime
  -> flush pending live dirty rect
  -> commit active stroke if any
  -> core persists JSONL atomically
  -> core queues/exports thumbnail
  -> ink-runtime releases framebuffer
  -> NOTE_CLOSED
  -> shell reacquires display
  -> shell restores previous Notes route snapshot
```

## Resident Runtime Preference

Preferred:

```text
idle/suspended
  -> acquire display
  -> restore framebuffer
  -> active
  -> release display
  -> idle/suspended
```

If the vendor engine cannot safely release and reacquire, the supervisor may
use a short-lived process per note session. Startup must be hidden behind the
PaperOS navigation transition and must not reset shell state.

## First Native UI

The first runtime toolbar includes only:

```text
Back
page title
undo
redo
pen
eraser
page navigation
```

No color, highlighter, pencil texture, lasso, zoom, or animations until the
gold baseline passes.

## Hard Gate

Native note mode cannot expand beyond ballpoint until all criteria in
[`PRO_MOVE_MARKER_PHASE2B_GATE.md`](PRO_MOVE_MARKER_PHASE2B_GATE.md) pass with
video and swap logs.
