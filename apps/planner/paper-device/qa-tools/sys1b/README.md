# PAPR.SYS.1b Launcher-Document discovery — QA instrumentation

> **QA-ONLY. Read-only. Never deployed.** These scripts run on the Mac and drive
> the reMarkable over SSH. They are **not** product lifecycle code, **not** a
> systemd unit, and **must not** be installed on the device. They exist solely to
> gather PAPR.SYS.1b discovery evidence. Canonical home for PAPR.SYS.1b QA tooling:
> `apps/planner/paper-device/qa-tools/sys1b/` (kept separate from the product
> device scripts in `apps/planner/paper-device/`).

**Discovery status (2026-07-11):** PAPR.SYS.1b.fs **BLOCKED / CLOSED** (filesystem/fd/snapshot signals unreliable). PAPR.SYS.1b.jrn **CONDITIONAL PASS accepted** — journal `EntityOpen::open` with document UUID (10/10 target opens · 0 known false positives). **Quick sheets** was only a test fixture (`6dc48b38-4709-4c41-8b49-77d5e0b1630a`); future production needs a dedicated **「Open PaperOS」** document. PAPR.SYS.1 implementation **not started — paused by owner**. Do **not** present these scripts as the future journal watcher.

Related: [`docs/qa/paperos-device-lifecycle-discovery.md`](../../../../../docs/qa/paperos-device-lifecycle-discovery.md) §PAPR.SYS.1b.jrn.

## Why these exist

The device (BusyBox v1.36.1) has **no** `inotifywait` / `inotifyd` / `strace` /
`fatrace` / `lsof`, and `/home` is `ext4 rw,relatime` (atime does not bump on
repeated opens). The discovery doc's original `inotifywait -m` monitor is
therefore unrunnable here. These scripts substitute zero-footprint observation.

## Files

| File                       | Role                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `observe-sys1b.sh`         | Phase A 3-channel synchronized observer (fd + snapshot + journal). Start it, operate the device, Ctrl-C or `stop-sys1b.sh`. |
| `snap-diff.sh`             | Post-hoc diff of `snap-raw.log` → `NEW/MOD/DEL` file events with tags.                                                      |
| `stop-sys1b.sh`            | Idempotent hard-stop; guarantees no observer process is left on the device.                                                 |
| `monitor-file-snapshot.sh` | Standalone file-snapshot monitor (superseded by `observe-sys1b.sh`; kept for reference).                                    |

## Channels (all read-only, zero device footprint)

| Channel                                                       | Captures                                                                                  | Cannot prove                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `fd.log` — `/proc/<xochitl-pid>/fd` poll (~60 ms)             | a document held **open** (fd present) — the only channel that can evidence an active open | a fast open/close between two samples (absence ≠ "not opened") |
| `snap-raw.log` — 1 Hz `find`+`stat`, diffed by `snap-diff.sh` | write side-effects: thumbnails, `.metadata` lastOpened, `.content`, sync-created files    | that a write == a deliberate user open                         |
| `journal.log` — `journalctl -fu xochitl`                      | xochitl log lines; **PAPR.SYS.1b.jrn viable signal:** `EntityOpen::open` + `EntityId{UUID}`    | closed-source format may change on OTA                         |

**Safety:** remote loops carry unique tokens (`SYS1B_OBS_*`) and self-terminate at
`SYS1B_MAXSEC` (default 2400 s). `stop-sys1b.sh` kills by token in multiple passes.
Verified: killing the local SSH does **not** propagate to the remote loop, so the
token-kill + MAXSEC backstop — not `-tt` — is the real safety mechanism.

## Runbook (bounded device window, operator = Ken)

```bash
# 1. Device awake? (it suspends & drops USB)
ping -c1 10.11.99.1

# 2. Start the observer (leave running; live fd + journal feed)
apps/planner/paper-device/qa-tools/sys1b/observe-sys1b.sh
#    capture dir printed, e.g. ~/paperos-sys1b-capture/<stamp>/

# 3. Perform the matrix, NARRATING each step out loud / in chat with rough times.
#    Between rows, pause a few seconds so channels settle.

# 4. Stop
apps/planner/paper-device/qa-tools/sys1b/stop-sys1b.sh   # (or Ctrl-C)

# 5. Analyse the snapshot side-effects
apps/planner/paper-device/qa-tools/sys1b/snap-diff.sh ~/paperos-sys1b-capture/<stamp>/snap-raw.log
```

## Physical matrix (Phase A)

Negative controls (must NOT produce the open signal), then the positive control:

1. thumbnail visible only (no touch)
2. thumbnail scrolled off-screen then back (no open)
3. search for the doc name (no open)
4. **open target document — repeat ≥10×** (positive control)
5. close target / return to library
6. open a **different** document
7. `systemctl suspend` + power wake, then open target
8. let `rm-sync` run an idle sync cycle

## PAPR.SYS.1b success criterion (open-only) — **MET via journal (conditional)**

**PAPR.SYS.1b.jrn:** journal `EntityOpen::open` with target UUID — 10/10 on deliberate opens · 0 false positives in bounded matrix. Verdict: **CONDITIONAL PASS** (OTA / fail-closed risks remain).

**PAPR.SYS.1b.fs:** filesystem/fd/snapshot — **BLOCKED**. Do not use `lastOpened`, metadata polling, or FD polling as production triggers.

Otherwise mark `PAPR.SYS.1b.fs: BLOCKED`. Do not tune heuristics indefinitely.

## Phase B — ephemeral inotify probe (only if Phase A inconclusive; needs Ken's OK)

Do **not** place a binary under `/home/root`. If open detection is unresolved,
build a minimal project-owned static aarch64 inotify probe from **reviewed
source** with the matching chiappa SDK, record source hash + binary SHA-256, and
place it **only** at `/tmp/paperos-sys1b/inotify-probe`. Watch only the target
UUID files; record `IN_OPEN IN_ACCESS IN_CLOSE_NOWRITE IN_MODIFY IN_CLOSE_WRITE
IN_CREATE IN_MOVED_TO IN_DELETE`. No prebuilt binary, no package install, no
systemd, no `/etc`/root changes. Delete `/tmp/paperos-sys1b` after; confirm no
monitor remains. **Not built yet.**

## Phase C — PAPR.SYS.1C Marker-confirmation (only if PAPR.SYS.1b blocked)

Discovery only, no launch. New **disposable** notebook via the Xochitl UI (not
Quick sheets). Test whether a Marker stroke produces a reliable target-doc write:
10/10 target strokes trigger; 20 non-target strokes → 0; thumbnail/search/
open-only/close-only/suspend/rm-sync → 0. Correlate target-UUID write + Marker
event within ±1500 ms; cooldown 10 s; debounce 2 s. Rediscover the Marker input
by capability, never hardcode the event number.

## Forbidden (all phases)

No PaperOS launch · no watcher install · no persistent device binary · no XOVI/
AppLoad · no Xochitl binary/QML/env modification · no LD_PRELOAD · no EVIOCGRAB ·
no power-button launcher · no PAPR.SYS.2/PAPR.SYS.3 work · no store modification while
Xochitl runs · no production route/token/UI/ink/sync changes.
