# PaperOS Lifecycle Runtime (PAPR.SYS.1)

Reliable **enter / exit / recovery** foundation for PaperOS on the reMarkable
Paper Pro Move. POSIX `sh`, BusyBox v1.36 compatible. Everything installs under
`/home/root/paperos` (persistent `/home`); nothing is written to `/usr` and no
boot unit is enabled. The only `/etc` write is the per-boot `systemctl link`
symlink, which lives on a tmpfs overlay and is gone on reboot (Manual Mode).

> **Status:** PAPR.SYS.1 — **PASS** (owner sign-off 2026-07-12; Finding C
> hardening host + device validated). **Scope:** no sleep/wake (SYS.2), no sync
> scheduling, no auto-launch-after-unlock, no boot-target change. Persistent
> `systemctl enable` of the watcher (**PAPR.SYS.1p**) is investigated but
> **DEFERRED** — see
> [`docs/qa/paperos-device-lifecycle-sys1p-persistent.md`](../../../../docs/qa/paperos-device-lifecycle-sys1p-persistent.md):
> this device's `/etc` is a tmpfs overlay, so a plain `enable` does not survive
> reboot, and the only mechanism that would (writing into the read-only root
> partition) needs a separate owner decision. Everything below still runs
> exactly as a **temporary, manually-started** runtime.

## Components

| File              | Role                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `paperos-lib.sh`  | Shared state machine, structured logging, locks, native-recovery core   |
| `paperos-enter`   | Managed handoff xochitl → PaperOS; idempotent; recovers on any failure   |
| `paperos-exit`    | Managed handoff PaperOS → xochitl; idempotent; bounded escalation        |
| `paperos-recover` | Emergency device-side return to native shell (steals stuck lock)        |
| `paperos-watch`   | Production journal watcher (PAPR.SYS.1b.jrn signal); fail-closed         |
| `paperos-ctl`     | Runtime control + diagnostics; System-menu contract entry points         |

## State machine

```text
NATIVE ─enter─▶ ENTERING_PAPEROS ─ready─▶ PAPEROS_ACTIVE
  ▲                   │ fail                     │ exit
  │                   ▼                          ▼
  └──────────── RECOVERY ◀──────────── EXITING_PAPEROS
DISABLED · INCOMPATIBLE are terminal fail-closed states (enter refuses).
```

State is persisted to `run/state` and readable via `paperos-ctl status`.

## Fail-closed policy (watcher)

The journal token is **not** a public API (may change on OTA). Every one of
these leaves xochitl active and does **not** launch PaperOS:

- UUID mismatch / partial / malformed `EntityId`
- `DISABLED` marker present
- `crashloop` latch (≥`FAIL_LIMIT`=2 enter failures within the fail window;
  each failure also forces a `FAIL_BACKOFF` pause — Finding C, Layer 3)
- OS `VERSION_ID` not in `compat.allowed` (or either file missing)
- launcher document absent from the Xochitl store
- event timestamp missing or older/newer than `MAX_EVENT_AGE` (replay guard)
- lifecycle state already ENTERING/ACTIVE/EXITING/RECOVERY
- xochitl not active
- inside the post-launch cooldown (duplicate suppression)
- journal pipeline restarted more than `MAX_RESTARTS` per window → watcher
  latches `watcher.exhausted` and exits (native system unaffected)

`paperos-enter` itself additionally fails closed (exit **9**, xochitl left
running) **before it stops xochitl** when either Finding-C guard trips: the
xochitl-cycle budget is exhausted, or the vendor `xochitl.service` start-limit
has drifted from what we validated (see the hardening section below). A budget
throttle (exit 9) is **not** counted as a crash by the watcher.

## Emergency disable

```sh
paperos-ctl disable   # blocks watcher triggers AND paperos-enter
paperos-ctl enable    # clears the marker
paperos-ctl arm       # clears crashloop + watcher.exhausted latches
```

## System-menu contract (wired by PAPR.SYS.3 QML)

| Menu action          | Entry point                     |
| -------------------- | ------------------------------- |
| Sleep                | `paperos-ctl sleep`             |
| Restart PaperOS      | `paperos-ctl restart-paperos`   |
| Return to reMarkable | `paperos-ctl return-native`     |
| Restart device       | `paperos-ctl reboot`            |
| Shut down            | `paperos-ctl poweroff`          |

`restart-paperos` / `return-native` detach (`nohup`) because PaperOS itself dies
mid-sequence when the unit stops.

`restart-paperos` is a **PaperOS-only in-place restart** (`systemctl restart
paperos` under a fresh `run/restart-intent` marker) that does **not** bounce
xochitl — the marker makes `paperos.service` `ExecStopPost` skip the xochitl
restore, and `Conflicts=` is a no-op because xochitl is already stopped. It
falls back to a native restore only if the restart fails to come up.

## Finding C hardening (vendor start-limit)

Every controlled xochitl restore is a xochitl **start**, and the vendor
rate-limits those (`StartLimitBurst=4` / 10 min) and force-reboots on overrun.
Four layers keep us clear of it (design + confirmation in
[`docs/qa/paperos-device-lifecycle-sys1-implementation.md`](../../../../docs/qa/paperos-device-lifecycle-sys1-implementation.md)
§"SYS.1 hardening design"):

1. **PaperOS-only restart** (above) — a restart adds **zero** xochitl starts.
2. **xochitl-cycle budget**, checked *before* xochitl is stopped: at most
   `XOCHITL_CYCLE_MAX` (2) controlled restores per `XOCHITL_CYCLE_WINDOW`
   (600 s) and ≥`MIN_SWITCH_INTERVAL` (180 s) between full switches; over
   budget → `enter` exits 9, xochitl untouched. Restores are tracked in
   `run/xochitl-restores`. Also fails closed if `systemctl show xochitl`
   reports a start-limit not strictly looser than our budget, or an
   `OnFailure` that no longer names `emergency.target` (OS-drift guard).
3. **Enter-failure threshold + backoff** — `FAIL_LIMIT`=2 with a forced
   `FAIL_BACKOFF` after each failure; the `crashloop` latch then requires a
   manual `paperos-ctl arm`.
4. **Manual-only start-limit reset** — the systemd `reset-failed` rescue is
   **never** invoked automatically. The only entry point is an explicit,
   fully-gated manual command:

   ```sh
   paperos-ctl recover-native --reset-start-limit
   # refused unless: PaperOS unit inactive, watcher stopped, 0 PaperOS procs,
   # state NATIVE/RECOVERY. Resets the xochitl start-limit once, starts xochitl
   # once, no retry, fully logged.
   ```

## Deploy (Manual Mode — session-scoped, reversible) & rollback

`deploy-lifecycle.sh` ships everything under `/home` (never `/usr`): the bin
scripts **and** the hardened unit to `/home/root/paperos/systemd/paperos.service`,
which it `systemctl link`s for the current boot (link ≠ enable) and then verifies
the effective `ExecStopPost` is the conditional restart-intent one — failing
closed if stale, so a bad unit is never entered. It does not enable anything,
does not stop xochitl, and is idempotent.

```sh
apps/planner/paper-device/deploy-lifecycle.sh                  # ship + link + verify unit
ssh remarkable-pro-move "echo <open-paperos-uuid> > /home/root/paperos/launcher.uuid"
ssh remarkable-pro-move /home/root/paperos/bin/paperos-watch   # arm watcher (this boot)
# → open the "Open PaperOS" document to enter PaperOS
apps/planner/paper-device/rollback-lifecycle.sh               # unlink + restore + verify (keeps /home install)
apps/planner/paper-device/rollback-lifecycle.sh --purge        # also remove bin/, systemd/paperos.service, compat, uuid
```

> **Manual Mode / reboot:** the `/etc` unit link is on a tmpfs overlay, so it
> does **not** survive a reboot. After a reboot xochitl starts normally as the
> default shell and PaperOS does not auto-start — re-run `deploy-lifecycle.sh`
> and re-arm the watcher for the new session. Persistent enablement is
> [`PAPR.SYS.1p`](../../../../docs/qa/paperos-device-lifecycle-sys1p-persistent.md)
> (deferred).

## Host tests

```sh
apps/planner/paper-device/tests/sys1/run-tests.sh    # 143 cases, mocked systemd
```

See [`docs/qa/paperos-device-lifecycle-sys1-implementation.md`](../../../../docs/qa/paperos-device-lifecycle-sys1-implementation.md)
for the design rationale and the Ken physical device gate. Persistent Mode A
(watcher via systemd, surviving reboot) is tracked separately in
[`docs/qa/paperos-device-lifecycle-sys1p-persistent.md`](../../../../docs/qa/paperos-device-lifecycle-sys1p-persistent.md)
(currently DEFERRED).
