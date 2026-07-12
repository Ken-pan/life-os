# PaperOS Lifecycle Runtime (PAPR.SYS.1)

Reliable **enter / exit / recovery** foundation for PaperOS on the reMarkable
Paper Pro Move. POSIX `sh`, BusyBox v1.36 compatible. Everything lives under
`/home/root/paperos` (persistent `/home`); nothing writes to `/etc` or enables a
boot unit.

> **Scope:** PAPR.SYS.1 only. No sleep/wake (SYS.2), no sync scheduling, no
> persistent `systemctl enable`, no auto-launch-after-unlock. Those require a
> separate Ken device gate.

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
- `crashloop` latch (≥3 enter failures within the fail window)
- OS `VERSION_ID` not in `compat.allowed` (or either file missing)
- launcher document absent from the Xochitl store
- event timestamp missing or older/newer than `MAX_EVENT_AGE` (replay guard)
- lifecycle state already ENTERING/ACTIVE/EXITING/RECOVERY
- xochitl not active
- inside the post-launch cooldown (duplicate suppression)
- journal pipeline restarted more than `MAX_RESTARTS` per window → watcher
  latches `watcher.exhausted` and exits (native system unaffected)

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

## Deploy (temporary, reversible) & rollback

```sh
apps/planner/paper-device/deploy-lifecycle.sh        # scp + chmod; enables NOTHING
ssh remarkable-pro-move /home/root/paperos/bin/paperos-watch   # manual foreground
apps/planner/paper-device/rollback-lifecycle.sh      # stop + restore + verify
apps/planner/paper-device/rollback-lifecycle.sh --purge   # full uninstall
```

## Host tests

```sh
apps/planner/paper-device/tests/sys1/run-tests.sh    # 80 cases, mocked systemd
```

See [`docs/qa/paperos-device-lifecycle-sys1-implementation.md`](../../../../docs/qa/paperos-device-lifecycle-sys1-implementation.md)
for the design rationale and the Ken physical device gate.
