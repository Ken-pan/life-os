# PaperOS on reMarkable Paper Pro Move

**Owner:** Planner · **Device:** reMarkable Paper Pro Move (`imx93-chiappa`) · **Status:** P-MOVE-4 shipped — daily-usable read path with CJK, pagination, Exit, crash recovery, and a systemd launcher

This is the execution plan for the Paper Pro Move UX path. The decision is to
build a home-only, session-based PaperOS first, then add autonomous
cache/scheduling only after the launcher path is recoverable. Planner is the
first functional provider for PaperOS.

> Numbering note: P-MOVE-3 was re-scoped during execution to the CJK font +
> pagination UX fix (the on-device blocker at the time). The controlled write
> MVP and later phases moved down; the old P-MOVE-3/4/5 scopes are now
> P-MOVE-5/6/7.

## Current State

| Area | Status | Evidence |
| --- | --- | --- |
| Device access | PASS | `ssh remarkable-pro-move` (USB, `10.11.99.1`); see [`../../PRO_MOVE_DEVICE_ACCESS.md`](../../PRO_MOVE_DEVICE_ACCESS.md) |
| Backend mock API | PASS | PR-1 mock endpoints callable; see [`../../PRO_MOVE_PR1_FINAL_GATE.md`](../../PRO_MOVE_PR1_FINAL_GATE.md) |
| Backend read API (prod) | PASS | `/api/paper/today` returns the real Planner day (23 tasks) with the device token |
| Backend action API | Implemented, gated | `/api/paper/actions`; real writes require `PAPER_ACTIONS_WRITE_ENABLED=true`; full local HTTP validation passed |
| Device read cache | PASS | `ApiClient` last-good cache (atomic write) + `refresh-cache.sh` sidecar; offline launch verified; see [`../../PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md`](../../PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md) |
| CJK rendering | PASS | Noto Sans CJK SC loaded at runtime from `/home/root/paperos/fonts/`; see [`../../PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md`](../../PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md) |
| E-ink pagination | PASS | Fixed 5-per-page, Prev/Next buttons, no flick/animation; operator-verified on device |
| Exit + crash recovery | PASS | Exit button, hardened trap/recover scripts, systemd `ExecStopPost` auto-restores xochitl after `kill -9`; see [`../../PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md`](../../PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md) |
| Device-side launcher | PASS | `systemctl start paperos` (unit in `/home`, root-fs symlink only); survives SSH disconnect |
| Shell MVP (6 modules) | PASS | Home/Today/Notes/Mail/Review/System + RefreshController + action queue + Quick Note v0; see [`../../PRO_MOVE_SHELL_MVP_GATE.md`](../../PRO_MOVE_SHELL_MVP_GATE.md) |
| Marker input | Phase 0 done, pen not usable yet | epaper QPA delivers touch only; pen node mapped — see [`../../PRO_MOVE_MARKER_PHASE0_INPUT_MAP.md`](../../PRO_MOVE_MARKER_PHASE0_INPUT_MAP.md); Phase 1 = `PenInputService` |
| Production read API | PASS | `/api/paper/today` + offline cache 已完成生产与设备验证（P-MOVE-2） |
| Production write enablement | Not enabled | Staging validation required before `PAPER_ACTIONS_WRITE_ENABLED=true` |
| xochitl integration | Out of scope | No xochitl patching, sidebar injection, or boot replacement |

Gap-analysis cross-check against the "ideal e-ink experience" report:
[`../../PRO_MOVE_STATUS_VS_IDEAL.md`](../../PRO_MOVE_STATUS_VS_IDEAL.md).

## Product Decision

Use **session-based PaperOS Mode**:

```text
stock boot -> xochitl -> systemctl start paperos (Conflicts stops xochitl)
          -> PaperOS foreground session
          -> Exit button / crash / systemctl stop
          -> ExecStopPost -> start xochitl
```

Do not patch xochitl and do not replace xochitl at boot. Paper Pro-class
devices need a conservative recovery story, and the current priorities are
safety, recoverability, autonomy, and update resilience.

## Execution Plan

### P-MOVE-1 — Home-Only Launcher Baseline · PASS 2026-07-09

Shell launcher (`open-paperos.sh`) + manual recovery (`recover-xochitl.sh`)
under `/home/root/paperos`, no systemd. See
[`../../PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md`](../../PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md).
(The "no `/etc/systemd/system` unit" acceptance was correct for this phase and
was deliberately superseded by the linked unit in P-MOVE-4.)

### P-MOVE-2 — PaperOS Read Path · PASS 2026-07-09

Last-good cache read-before-fetch, token auth, offline resilience, sync
status footer. See
[`../../PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md`](../../PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md).

### P-MOVE-3 — CJK Font + Pagination UX · PASS 2026-07-09

Noto Sans CJK SC runtime loading with fallback; scroll replaced by fixed
5-per-page pagination. Operator-verified on device. See
[`../../PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md`](../../PRO_MOVE_P_MOVE_3_CJK_PAGINATION_GATE.md).

### P-MOVE-4 — Exit, Crash Recovery, Device Launcher · PASS 2026-07-09

Exit button, hardened launcher/recover scripts with exit-code logging,
`paperos.service` linked from `/home` (crash auto-recovery via
`ExecStopPost`, session survives SSH disconnect). See
[`../../PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md`](../../PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md).

### P-MOVE-5 — Controlled Write MVP · NEXT (was P-MOVE-3)

**Goal:** allow one safe paper action from the device.

Scope:
- Keep backend default dry-run.
- Enable `PAPER_ACTIONS_WRITE_ENABLED=true` only in staging first.
- Device sends `task.complete` with `clientBatchId`, `clientActionId`, and `baseVersion`.
- Device queue removes applied/duplicate actions and drops rejected permanent failures.
- UI: wire the mock checkbox to the action queue.

Acceptance:
- Fresh complete creates one `paper_device_actions` row.
- Duplicate retry returns prior result without changing `completedAt`.
- Stale or deleted task returns conflict/rejected and refreshes cache.
- Production write switch remains off until staging passes.

### P-MOVE-6 — Scheduled Cache / Manual Sync · PLANNED (was P-MOVE-4)

**Goal:** reduce Mac dependency while preserving stock boot.

Scope:
- "Sync now" button in the UI (reuses `ApiClient::fetchDashboard()`).
- Optional systemd timer that runs `refresh-cache.sh` only (no auto UI
  handoff), installed via the same `/home` + `systemctl link` pattern.
- Performance baseline: cold-start time, page-flip latency, RSS recorded in
  the gate doc.

Acceptance:
- Stock boot remains xochitl-first.
- Timer can be disabled and removed with one documented rollback command.
- Cache refresh never requires xochitl document-store mutation.

### P-MOVE-7 — Read-Only Document Export Track (was P-MOVE-5)

**Goal:** explore xochitl-native discoverability without xochitl patching.

Scope:
- Generate a read-only Planner Today PDF/PNG from cached data.
- Treat xochitl document-store mutation as a separate risk gate.
- Prefer import/sync workflows over live local mutation while xochitl runs.

Acceptance:
- Exported document is readable offline.
- Refresh behavior is explicit: last rendered timestamp is visible.
- No live writes to xochitl storage while xochitl is running.

## Explicit Non-Goals

- No xochitl binary patching.
- No xochitl sidebar/tab injection.
- No boot replacement where PaperOS starts before stock xochitl.
- No checked-in device token or font binaries.
- No production write enablement before staging validation.

## Remaining Before Daily Use

- [ ] **Restore production Paper API** — `/api/paper/today` 404s since a 2026-07-09 Netlify deploy (blocks all device sync).
- [ ] Marker Phase 1: `PenInputService` on `/dev/input/event2` (pen taps, pressure, eraser); until then PaperOS is touch-only.
- [ ] Post-reboot step: re-run `systemctl link /home/root/paperos/paperos.service` (the `/etc` overlay drops the symlink); or fold into an OS-upgrade drill doc.
- [x] Operator confirms Exit-button tap on screen (worked — the "frozen" report was an unsupervised bare-binary test session; see Shell MVP gate incident 1).
- [ ] "Sync now" button (P-MOVE-6).
- [ ] Font regression string in a repeatable QA step (中英混排 acceptance text).
- [ ] Performance baseline capture (P-MOVE-6).
- [ ] OS-upgrade drill: relink unit + redeploy binary, record in gate doc.
- [ ] Staging validation, then production write enablement (P-MOVE-5).
