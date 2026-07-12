# PAPR.SYS.1 — Lifecycle Runtime Implementation

**Status:** IMPLEMENTATION READY FOR DEVICE GATE — host-validated, not yet run
on device
**Owner:** Ken + Codex · **Agent 线:** Line B (Shell)
**Depends on:** [`paperos-device-lifecycle-discovery.md`](./paperos-device-lifecycle-discovery.md)
(PAPR.SYS.1b.jrn CONDITIONAL PASS — accepted)

> Reliable **enter / exit / recovery** foundation. Turns PaperOS into something
> that enters reliably, exits reliably, returns to xochitl after a crash, will
> not launch on a wrong/replayed/incompatible journal signal, and can be
> emergency-disabled — all without persistent systemd enablement.

## Not in this phase

`PAPR.SYS.2` sleep/wake · sync scheduling · `PAPR.SYNC.6` · Slice 2 QML ·
persistent `systemctl enable` · boot hooks · auto-launch-after-unlock ·
removing native xochitl recovery. All require a separate Ken device gate.

## Process topology

```text
Native:        xochitl.service ──(Wants/BindsTo)── rm-sync.service
Launch:        paperos.service  (Conflicts=xochitl.service,
                                 ExecStopPost=start xochitl)

Watcher (temporary, manual):
  paperos-watch ── journalctl -fu xochitl -n 0 ──▶ parse ──▶ paperos-enter
                                                              │
                                                    systemctl start paperos
                                                    (xochitl+rm-sync stop,
                                                     PaperOS foreground)
```

The watcher owns **only** signal detection and the single `paperos-enter`
invocation. Process lifetime is owned by systemd (`paperos.service`), with
`ExecStopPost` as the always-on native fallback. `paperos-recover` is the
device-side emergency owner that does not depend on the Mac.

## File manifest

Runtime (deployed to `/home/root/paperos/bin/`):

- `apps/planner/paper-device/lifecycle/paperos-lib.sh`
- `apps/planner/paper-device/lifecycle/paperos-enter`
- `apps/planner/paper-device/lifecycle/paperos-exit`
- `apps/planner/paper-device/lifecycle/paperos-recover`
- `apps/planner/paper-device/lifecycle/paperos-watch`
- `apps/planner/paper-device/lifecycle/paperos-ctl`
- `apps/planner/paper-device/lifecycle/README.md`

Deploy / rollback (Mac-side):

- `apps/planner/paper-device/deploy-lifecycle.sh`
- `apps/planner/paper-device/rollback-lifecycle.sh`

Tests:

- `apps/planner/paper-device/tests/sys1/run-tests.sh` (80 cases, mocked systemd)

On-device state (never committed):

```text
/home/root/paperos/
  launcher.uuid        dedicated "Open PaperOS" document UUID (manual)
  compat.allowed       accepted OS VERSION_ID allowlist (seeded on deploy)
  DISABLED             emergency-disable marker (owner-facing)
  bin/                 the six runtime files above
  run/
    state              current lifecycle state + timestamp
    lifecycle.log      structured, rotated at 256 KB
    lock.lifecycle/    enter/exit mutex (mkdir lock)
    lock.watch/        single-watcher lock
    crashloop          latch: ≥3 enter failures in the fail window
    watcher.exhausted  latch: journal restart budget exceeded
```

## Enter sequence (`paperos-enter`)

1. acquire lifecycle lock (exit 2 if busy)
2. `DISABLED` marker → state DISABLED, exit 3
3. OS `VERSION_ID` not in `compat.allowed` → state INCOMPATIBLE, exit 4
4. binary missing / not executable → exit 5, xochitl untouched
5. already ready → state PAPEROS_ACTIVE, noop exit 0 (**idempotent**)
6. state ENTERING_PAPEROS; `systemctl start paperos` (Conflicts stops xochitl)
7. poll readiness ≤ `READY_TIMEOUT`; then a `STABLE_SECS` window so an
   instantly-dying binary is not reported active
8. success → state PAPEROS_ACTIVE, exit 0
9. any failure → `recover_to_native`; exit 6 if native restored, exit 7 if not

## Exit sequence (`paperos-exit`)

1. acquire lifecycle lock (exit 2 if busy)
2. already native + no PaperOS → noop exit 0 (**idempotent**)
3. state EXITING_PAPEROS; `systemctl stop paperos` (ExecStopPost restores
   xochitl); wait ≤ `STOP_TIMEOUT`
4. bounded stray-process escalation (TERM, grace, KILL) — device has no `pkill`
5. verify xochitl **and** rm-sync active + zero PaperOS procs → NATIVE, exit 0
6. otherwise `recover_to_native`; exit 0 if restored, exit 8 if not

## Crash-loop recovery (`paperos-recover`)

Device-side, Mac-independent. Steals a stuck lifecycle lock (this is the
emergency path), stops the systemd unit, TERM/KILL residue, clears stale test
locks, starts xochitl, and verifies **both** xochitl and rm-sync active with
zero PaperOS processes before declaring NATIVE. Idempotent.

Watcher-level crash-loop protection: `paperos-watch` counts `paperos-enter`
failures; `FAIL_LIMIT` (default 3) within `FAIL_WINDOW` (default 300 s) latches
`run/crashloop`, after which every candidate open is blocked until
`paperos-ctl arm`.

## Fail-closed behaviour

The journal token is not a public API. `paperos-watch` launches **only** on the
exact accepted event and blocks (no launch, xochitl active) on: UUID
mismatch/partial/malformed, `DISABLED`, `crashloop`, OS incompatibility (or
missing files), launcher document deleted, missing/stale/future event timestamp
(replay guard), non-NATIVE lifecycle state, xochitl inactive, cooldown
duplicate, and — for the pipeline itself — a bad/missing launcher UUID (refuses
to start) or journal restart-budget exhaustion (latches `watcher.exhausted`,
exits). Parser never guesses: an `EntityId` without its preceding `EntityOpen`
(e.g. `rm.docworker` / `rm.documentlockmanager` index noise) produces no
decision.

## Emergency disable

`paperos-ctl disable` writes `DISABLED`, which blocks both the watcher trigger
and `paperos-enter` directly. `enable` clears it; `arm` clears the crashloop and
watcher-exhausted latches.

## OTA compatibility

`compat.allowed` lists accepted `VERSION_ID`s; deploy seeds it from the device's
current `/etc/os-release`. After an OTA the version changes, `compat_ok` fails,
and enter/watcher fail closed until an operator re-validates and appends the new
version. Because runtime lives in `/home` (not `/etc`), an OTA cannot silently
re-point or partially install it.

## Validation

### Host (no device) — `tests/sys1/run-tests.sh`

Runs the **real** device scripts against mocked `systemctl`/`ps`/`kill`/
`journalctl`. **80/80 pass, deterministic.** Coverage:

- exact accepted event → LAUNCH; single-line and 3-line variants
- wrong UUID · partial UUID · malformed `EntityId` → IGNORE
- duplicate event · 5-event burst → exactly one LAUNCH
- indexing/sync noise & lone `EntityId` → no decision
- pending-window expiry after unrelated lines
- DISABLED · crashloop · incompatible · missing compat · launcher-deleted ·
  stale(replay) · no-timestamp · non-NATIVE state → BLOCK
- missing / malformed launcher UUID → watcher refuses to run
- enter: success · idempotent repeat · binary-missing · disabled · incompatible
  · readiness-fail→recover · unit-start-fail→recover · recover-also-fails→exit 7
- exit: normal · idempotent repeat · stray-process escalation ·
  rm-sync-fails→exit 8
- recover: stray+stale-lock cleanup · idempotent repeat
- watcher run mode: one live event → one enter · 3 failures → crashloop latch ·
  restart budget → exhausted latch+exit · exhausted latch blocks start
- ctl: disable/enable/arm round-trip · status output

Syntax: `sh -n` clean on all six runtime scripts + both deploy/rollback scripts.
(`shellcheck` is not installed in this environment; `sh -n` used instead.)

### Temporary device validation (Ken physical gate — pending)

Reversible only: manual foreground watcher, no `systemctl enable`, no boot hook.
Record xochitl/PaperOS baseline before, restore native after.

| # | Physical action                                | Expected                                   |
| - | ---------------------------------------------- | ------------------------------------------ |
| 1 | Open launcher document                         | PaperOS enters once                        |
| 2 | Open unrelated document                        | no launch                                  |
| 3 | Duplicate open within cooldown                 | no duplicate PaperOS                       |
| 4 | Force PaperOS launch failure                   | xochitl returns                            |
| 5 | Restart PaperOS (`paperos-ctl restart-paperos`)| works                                      |
| 6 | Return to reMarkable (`paperos-ctl return-native`)| xochitl + rm-sync active                 |
| 7 | Stop watcher                                    | native system unaffected                   |
| 8 | `paperos-ctl disable` then open launcher       | launch blocked                             |

End state each run: `xochitl=active · rm-sync=active · PaperOS=0 · watcher=0`.

## Rollback

```sh
apps/planner/paper-device/rollback-lifecycle.sh          # stop watcher+runtime,
                                                         # remove run/, restore
                                                         # xochitl, verify
apps/planner/paper-device/rollback-lifecycle.sh --purge  # also remove bin/,
                                                         # compat.allowed,
                                                         # launcher.uuid, DISABLED
```

Native fallbacks (`open-paperos.sh`, `recover-xochitl.sh`, linked
`paperos.service`) are untouched — the pre-SYS.1 recovery path stays intact.

## Guardrails held

- Persistent systemd enabled: **NO**
- Permanent boot integration changed: **NO**
- Native xochitl recovery preserved: **YES**

## Remaining blockers before persistent enablement

1. Ken physical device gate (table above) not yet run
2. Dedicated **「Open PaperOS」** launcher document not yet created; `launcher.uuid`
   unset (watcher fails closed until set)
3. Journal token stability across OTA is observational, not contractual —
   `compat.allowed` gate is the mitigation
4. Persistent `systemctl enable` / boot integration deferred to a later gate

## Next phase after Ken gate

`PAPR.SYS.2` — sleep / wake / idle + wake sync reconciliation.
