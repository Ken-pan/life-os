# PaperOS on reMarkable Paper Pro Move

**Owner:** Planner · **Device:** reMarkable Paper Pro Move (`imx93-chiappa`) · **Status:** P-MOVE-1 in progress

This is the execution plan for the Paper Pro Move UX path. The decision is to
build a home-only, session-based PaperOS first, then add autonomous
cache/scheduling only after the launcher path is recoverable. Planner is the
first functional provider for PaperOS.

## Current State

| Area | Status | Evidence |
| --- | --- | --- |
| Device access | Previously verified | `ssh remarkable-pro-move`; legacy writable workspace `/home/root/planneros-lite`; see [`../../PRO_MOVE_DEVICE_ACCESS.md`](../../PRO_MOVE_DEVICE_ACCESS.md) |
| Current live SSH | Blocked | 2026-07-09 check timed out on `10.11.99.1:22`; reconnect USB/Wi-Fi SSH before device mutation |
| Backend mock API | PASS | PR-1 mock endpoints callable; see [`../../PRO_MOVE_PR1_FINAL_GATE.md`](../../PRO_MOVE_PR1_FINAL_GATE.md) |
| Backend read API | PASS | `/api/paper/today` and `/api/paper/delta` verified via local Netlify dev; see [`../../PRO_MOVE_PR2_READ_ONLY_GATE.md`](../../PRO_MOVE_PR2_READ_ONLY_GATE.md) and [`../../PRO_MOVE_PR2_MERGE_GATE.md`](../../PRO_MOVE_PR2_MERGE_GATE.md) |
| Backend action API | Implemented with safety switch | `/api/paper/actions`; real writes require `PAPER_ACTIONS_WRITE_ENABLED=true` |
| Real write scope | PR-3B MVP | `task.complete` only; unsupported actions rejected |
| Idempotency | PASS locally | `paper_device_actions` log-first state machine; full local HTTP A-E validation passed with RLS enabled; see [`../../PRO_MOVE_PR3B_LOCAL_VALIDATION_GAP_GATE.md`](../../PRO_MOVE_PR3B_LOCAL_VALIDATION_GAP_GATE.md) |
| Production write enablement | Not enabled | Staging/production validation still required before `PAPER_ACTIONS_WRITE_ENABLED=true` |
| Device app UX | Partially prepared | Old device workspace exists as `/home/root/planneros-lite`; PaperOS canonical workspace should be `/home/root/paperos` |
| xochitl integration | Out of scope | No xochitl patching, sidebar injection, or boot replacement in this phase |

## Product Decision

Use **session-based PaperOS Mode**:

```text
stock boot -> xochitl -> open-paperos.sh -> stop xochitl
          -> PaperOS foreground session -> exit/crash trap
          -> start xochitl
```

Do not patch xochitl and do not replace xochitl at boot. Paper Pro-class
devices need a conservative recovery story, and the current priorities are
safety, recoverability, autonomy, and update resilience.

## Execution Plan

### P-MOVE-1 — Home-Only Launcher Baseline

**Goal:** make the session model repeatable under the PaperOS name without
touching `/usr`, `/etc`, or xochitl internals.

Scope:
- Repo templates in [`../../../apps/planner/paper-device/README.md`](../../../apps/planner/paper-device/README.md)
- `open-paperos.sh` with `systemctl stop xochitl` + cleanup trap
- `recover-xochitl.sh` for manual recovery
- `config.example.json` with no checked-in token
- Migrate or mirror the legacy `/home/root/planneros-lite` workspace to `/home/root/paperos`
- Manual `scp` deployment to `/home/root/paperos` once SSH is reachable

Acceptance:
- `sh -n apps/planner/paper-device/open-paperos.sh`
- `sh -n apps/planner/paper-device/recover-xochitl.sh`
- Device directory remains under `/home/root/paperos`
- `recover-xochitl.sh` returns `active`
- No `/etc/systemd/system` unit is installed

### P-MOVE-2 — PaperOS Read Path

**Goal:** prove the app can be useful offline before enabling more writes.

Scope:
- Build or package the PaperOS device binary.
- Read `/api/paper/today` into `cache.json`.
- On network failure, render last-good cache with `last_sync.txt`.
- Show battery/network/cache status in a quiet footer.

Acceptance:
- Fresh network fetch renders Today tasks.
- Airplane/offline state renders cached Today.
- Missing/invalid token fails closed with a visible device-local error.
- Exit returns to xochitl.

### P-MOVE-3 — Controlled Write MVP

**Goal:** allow one safe paper action from the device.

Scope:
- Keep backend default dry-run.
- Enable `PAPER_ACTIONS_WRITE_ENABLED=true` only in staging first.
- Device sends `task.complete` with `clientBatchId`, `clientActionId`, and `baseVersion`.
- Device queue removes applied/duplicate actions and drops rejected permanent failures.

Acceptance:
- Fresh complete creates one `paper_device_actions` row.
- Duplicate retry returns prior result without changing `completedAt`.
- Stale or deleted task returns conflict/rejected and refreshes cache.
- Production write switch remains off until staging passes.

### P-MOVE-4 — Background Cache / Manual Autonomy

**Goal:** reduce Mac dependency while preserving stock boot.

Scope:
- Add a small cache refresh helper under `/home/root/paperos`.
- Consider optional delayed/manual systemd timer only after P-MOVE-1/P-MOVE-2 pass.
- If a timer is used, install it as a reversible `/etc/systemd/system` change.

Acceptance:
- Stock boot remains xochitl-first.
- Timer can be disabled and removed with one documented rollback command.
- Cache refresh never requires xochitl document-store mutation.

### P-MOVE-5 — Read-Only Document Export Track

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
- No checked-in device token.
- No production write enablement before staging validation.

## Roadmap Delta

Already successful:
- [x] PR-1 mock API: today/actions/delta/heartbeat.
- [x] PR-2 read-only real API: `/api/paper/today`, `/api/paper/delta`, dry-run actions.
- [x] PR-3A idempotency/action-log design.
- [x] PR-3B local full HTTP validation: fresh complete, duplicate retry, unsupported actions, stale version, received recovery.
- [x] Device access and legacy workspace verification: `/home/root/planneros-lite`.

Remaining before daily use on Move:
- [ ] Restore live SSH access to `remarkable-pro-move`.
- [ ] Inspect legacy `/home/root/planneros-lite` contents and decide whether to rename, copy, or symlink to `/home/root/paperos`.
- [ ] Deploy PaperOS templates to `/home/root/paperos`.
- [ ] Identify the previously successful runtime artifact or package a new `paperos` binary.
- [ ] Run PaperOS session and verify exit/recovery returns xochitl to `active`.
- [ ] Wire PaperOS read cache against `/api/paper/today`.
- [ ] Run staging validation before enabling real writes outside local validation.

## Immediate Next Checklist

- [x] Add repo-side paper-device launcher templates.
- [x] Add this roadmap page and hub links.
- [x] Reconcile prior success evidence from PR-1/PR-2/PR-3B gate docs.
- [ ] Restore live SSH access and inspect the legacy device workspace.
- [ ] Deploy/migrate PaperOS under `/home/root/paperos`.
- [ ] Record device-session evidence in a new gate doc before P-MOVE-2.
