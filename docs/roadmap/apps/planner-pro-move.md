# PaperOS on reMarkable Paper Pro Move

**Owner:** Planner · **Device:** reMarkable Paper Pro Move (`imx93-chiappa`) · **Status:** P-MOVE-2 next

This is the execution plan for the Paper Pro Move UX path. The decision is to
build a home-only, session-based PaperOS first, then add autonomous
cache/scheduling only after the launcher path is recoverable. Planner is the
first functional provider for PaperOS.

## Current State

| Area | Status | Evidence |
| --- | --- | --- |
| Device access | Previously verified | `ssh remarkable-pro-move`; legacy writable workspace `/home/root/planneros-lite`; see [`../../PRO_MOVE_DEVICE_ACCESS.md`](../../PRO_MOVE_DEVICE_ACCESS.md) |
| Current live SSH | PASS | 2026-07-09 live session reached `imx93-chiappa`; see [`../../PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md`](../../PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md) |
| Backend mock API | PASS | PR-1 mock endpoints callable; see [`../../PRO_MOVE_PR1_FINAL_GATE.md`](../../PRO_MOVE_PR1_FINAL_GATE.md) |
| Backend read API | PASS | `/api/paper/today` and `/api/paper/delta` verified via local Netlify dev; see [`../../PRO_MOVE_PR2_READ_ONLY_GATE.md`](../../PRO_MOVE_PR2_READ_ONLY_GATE.md) and [`../../PRO_MOVE_PR2_MERGE_GATE.md`](../../PRO_MOVE_PR2_MERGE_GATE.md) |
| Backend action API | Implemented with safety switch | `/api/paper/actions`; real writes require `PAPER_ACTIONS_WRITE_ENABLED=true` |
| Real write scope | PR-3B MVP | `task.complete` only; unsupported actions rejected |
| Idempotency | PASS locally | `paper_device_actions` log-first state machine; full local HTTP A-E validation passed with RLS enabled; see [`../../PRO_MOVE_PR3B_LOCAL_VALIDATION_GAP_GATE.md`](../../PRO_MOVE_PR3B_LOCAL_VALIDATION_GAP_GATE.md) |
| Production write enablement | Not enabled | Staging/production validation still required before `PAPER_ACTIONS_WRITE_ENABLED=true` |
| Device app UX | P-MOVE-1 PASS | Old binary migrated from `/home/root/planneros-lite/planneros-lite` to `/home/root/paperos/paperos`; launcher/recovery verified |
| Production read API | PASS | 2026-07-09 production redeploy included Netlify functions; `/api/paper/today` returns 200 with `PAPER_DEVICE_TOKEN` |
| Device read cache | PASS | `/home/root/paperos/refresh-cache.sh` writes `cache.json` and `last_sync.txt` from production API; see [`../../PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md`](../../PRO_MOVE_P_MOVE_2_READ_CACHE_GATE.md) |
| PaperOS read-cache binary | Pending SDK build | Source is wired to cache/token paths; rebuilt `paperos` binary still needs the reMarkable Qt6 SDK |
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
- `refresh-cache.sh` for the P-MOVE-2 read-cache path

Acceptance:
- `sh -n apps/planner/paper-device/open-paperos.sh`
- `sh -n apps/planner/paper-device/recover-xochitl.sh`
- Device directory remains under `/home/root/paperos`
- `recover-xochitl.sh` returns `active`
- No `/etc/systemd/system` unit is installed

Status: **PASS on 2026-07-09**. See
[`../../PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md`](../../PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md).

### P-MOVE-2 — PaperOS Read Path

**Goal:** prove the app can be useful offline before enabling more writes.

Scope:
- Rebuild the PaperOS Qt/QML device binary from
  [`../../../apps/planner-device/remarkable-lite`](../../../apps/planner-device/remarkable-lite).
- Read `/home/root/paperos/cache.json` before any network request.
- Fetch `/api/paper/today` with `/home/root/paperos/token`.
- On network failure, keep rendering last-good cache with `last_sync.txt`.
- Show cache/API status in a quiet footer.

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
- [x] Restore live SSH access to `remarkable-pro-move`.
- [x] Inspect legacy `/home/root/planneros-lite` contents and decide whether to rename, copy, or symlink to `/home/root/paperos`.
- [x] Deploy PaperOS templates to `/home/root/paperos`.
- [x] Identify the previously successful runtime artifact or package a new `paperos` binary.
- [x] Run PaperOS session and verify exit/recovery returns xochitl to `active`.
- [x] Add `/home/root/paperos/token` and verify `refresh-cache.sh` against `/api/paper/today`.
- [x] Restore PaperOS device source into this monorepo.
- [x] Wire PaperOS source to load `cache.json`, `token`, and `last_sync.txt`.
- [ ] Rebuild the updated `paperos` binary with the reMarkable Qt6 SDK.
- [ ] Deploy rebuilt `paperos` to `/home/root/paperos/paperos` and verify offline cached rendering.
- [ ] Run staging validation before enabling real writes outside local validation.

## Immediate Next Checklist

- [x] Add repo-side paper-device launcher templates.
- [x] Add this roadmap page and hub links.
- [x] Reconcile prior success evidence from PR-1/PR-2/PR-3B gate docs.
- [x] Restore live SSH access and inspect the legacy device workspace.
- [x] Deploy/migrate PaperOS under `/home/root/paperos`.
- [x] Record device-session evidence in a new gate doc before P-MOVE-2.
- [x] Install device token and validate read-cache refresh.
- [ ] Build and deploy the refreshed PaperOS Qt binary.
