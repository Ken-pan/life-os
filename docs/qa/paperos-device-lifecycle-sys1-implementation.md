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

### Temporary device validation — Ken physical gate (exact runbook)

**Reversible only.** No `systemctl enable`, no boot hook, no `/etc` write, no
binary deletion. The one systemd override used (step 10) is a `/run` drop-in on
tmpfs — reverted in the same step and gone on reboot regardless. If any step's
**failure stop condition** trips: STOP the gate and run that step's rollback
command; do not continue.

Conventions: `$DEV` = the SSH host (`remarkable-pro-move`), `$T` =
`/home/root/paperos`. Run deploy/rollback from the Mac (repo root); run the
`ssh $DEV …` lines from the Mac too. `EMERGENCY ROLLBACK` (any step):
`apps/planner/paper-device/rollback-lifecycle.sh`.

Global end-state after every enter/exit/recover step:
`xochitl=active · rm-sync=active · paperos_procs=0` (watcher steps also expect
`watcher-procs` = 0 once stopped).

#### 1. Preflight — device reachable, native baseline

```sh
DEV=remarkable-pro-move; T=/home/root/paperos
ping -c1 10.11.99.1                       # device may sleep + drop USB; press power if it fails
ssh $DEV 'systemctl is-active xochitl rm-sync; echo os=$(sed -n s/^VERSION_ID=//p /etc/os-release)'
```

- Expected state: NATIVE (no lifecycle installed yet)
- Expected process: `xochitl` + `rm-sync` running; no `paperos` process
- Expected exit code: `0`; both units print `active`
- Failure stop: device unreachable, or either unit not `active` → fix device first; do not deploy
- Rollback: none (nothing deployed)

#### 2. Deploy (temporary, reversible)

```sh
apps/planner/paper-device/deploy-lifecycle.sh
```

- Expected state: files under `$T/bin/`; `$T/compat.allowed` seeded from current `VERSION_ID`; `$T/run/` created; `paperos.service LoadState=loaded` (deploy links the existing unit — `link` ≠ `enable`: no boot autostart, the unit has no `[Install]` section so it cannot be enabled, and `/etc` is volatile so the link is gone on reboot)
- Expected process: unchanged — `xochitl` + `rm-sync` still active (deploy never stops xochitl)
- Expected exit code: `0`; output shows `paperos.service LoadState=loaded` and ends "Deployed (temporary, reversible). Nothing was enabled or auto-started."
- Failure note: `LoadState=not-found` → the unit isn't linked; `paperos-enter` will fail-closed to native (proven safe) but no launch will occur until deploy re-links it
- Failure stop: scp/ssh error, or trailing status shows `xochitl` not active → run rollback
- Rollback: `apps/planner/paper-device/rollback-lifecycle.sh --purge`

#### 3. Set launcher UUID (dedicated "Open PaperOS" document)

Create a dedicated **Open PaperOS** notebook in Xochitl first, find its UUID,
then bind it (do **not** reuse the Quick sheets discovery fixture):

```sh
ssh $DEV 'ls -t ~/.local/share/remarkable/xochitl/*.metadata | head'   # identify the new doc UUID
ssh $DEV 'echo <OPEN-PAPEROS-UUID> > '"$T"'/launcher.uuid'
ssh $DEV "$T/bin/paperos-ctl status | grep launcher_uuid"
```

- Expected state: `launcher_uuid=<uuid>` (lowercase 8-4-4-4-12)
- Expected process: unchanged native
- Expected exit code: `0`; `launcher_uuid` is not `missing`
- Failure stop: `launcher_uuid=missing` or malformed → watcher will fail closed; fix before step 4
- Rollback: `ssh $DEV 'rm -f '"$T"'/launcher.uuid'`

#### 4. Start foreground watcher (manual — NO systemd)

In a dedicated SSH terminal that Ken keeps open:

```sh
ssh $DEV "$T/bin/paperos-watch"           # foreground; Ctrl-C or step 7 to stop
```

- Expected state: log line `event=start uuid=<uuid> …`; watcher blocks waiting on the journal
- Expected process: exactly one `paperos-watch` + its `journalctl -fu xochitl -n 0`
- Expected exit code: still running (foreground). Immediate exit `4` = bad UUID (redo step 3); `5` = exhausted latch (`paperos-ctl arm`); `6` = OS incompatible (check `compat.allowed`)
- Failure stop: watcher exits immediately with 4/5/6 → resolve the cause; do not proceed
- Rollback: Ctrl-C, then `apps/planner/paper-device/rollback-lifecycle.sh`

#### 5. Inspect status (structured diagnostics)

```sh
ssh $DEV "$T/bin/paperos-ctl status"
```

- Expected state: `state=NATIVE`, `disabled=no`, `crashloop=no`, `watcher_exhausted=no`, `compat=ok`, `watcher_running=1`
- Expected process: `xochitl=active rm_sync=active paperos_unit=inactive paperos_procs=0`
- Expected exit code: `0`
- Failure stop: `compat=FAIL-CLOSED`, or `watcher_running=0` when step 4 is up → investigate
- Rollback: n/a (read-only)

#### 6. Enter — true positive + false positives (physical opens)

With the step-4 watcher running, Ken physically:
(a) opens the **Open PaperOS** document → **one** enter;
(b) opens an **unrelated** document → **no** enter;
(c) rapidly re-opens the launcher within the cooldown → **no duplicate**.

Verify from a second SSH terminal:

```sh
ssh $DEV "$T/bin/paperos-ctl status"
ssh $DEV "grep -c 'result=LAUNCH' $T/run/lifecycle.log"
```

- Expected state: after (a) `state=PAPEROS_ACTIVE`; watcher log shows `result=LAUNCH` once, `result=IGNORE`/`BLOCK reason=duplicate` for (b)/(c)
- Expected process: after (a) one `paperos` process; `xochitl_unit=inactive` (Conflicts stopped it)
- Expected exit code: `paperos-enter` (invoked by watcher) `0` on the accepted open
- Failure stop: unrelated open launches PaperOS, OR duplicate spawns a second instance, OR launcher open does nothing → run rollback
- Rollback: `apps/planner/paper-device/rollback-lifecycle.sh`

#### 7. Exit — Return to reMarkable

```sh
ssh $DEV "$T/bin/paperos-ctl exit"        # synchronous; returns when native verified
```

- Expected state: `state=NATIVE`
- Expected process: `xochitl=active rm_sync=active paperos_procs=0`
- Expected exit code: `0` (native verified). `8` = native restore failed
- Failure stop: exit `8`, or `paperos_procs` > 0 after → run recover (step 11), then rollback
- Rollback: `apps/planner/paper-device/rollback-lifecycle.sh`

#### 8. Restart PaperOS (idempotent enter/exit cycle)

Enter again (physical launcher open, or `paperos-ctl enter` over SSH), then:

```sh
ssh $DEV "$T/bin/paperos-ctl restart-paperos"   # detached: exit then enter
sleep 30
ssh $DEV "$T/bin/paperos-ctl status"
```

- Expected state: transient `EXITING_PAPEROS` → `ENTERING_PAPEROS` → `PAPEROS_ACTIVE`
- Expected process: exactly **one** `paperos` process after settle (no doubled instance)
- Expected exit code: `restart-paperos` returns `0` immediately (detached); final `status` shows `state=PAPEROS_ACTIVE`
- Failure stop: two `paperos` processes, or state stuck `RECOVERY` → run recover (step 11)
- Rollback: `apps/planner/paper-device/rollback-lifecycle.sh`

#### 9. Emergency disable / enable

```sh
ssh $DEV "$T/bin/paperos-ctl exit"        # back to native first
ssh $DEV "$T/bin/paperos-ctl disable"
ssh $DEV "$T/bin/paperos-ctl enter"; echo "enter rc=$?"   # must be refused
ssh $DEV "$T/bin/paperos-ctl status | grep -E 'state|disabled'"
ssh $DEV "$T/bin/paperos-ctl enable"
```

- Expected state: after disable `disabled=yes`, `state=DISABLED`; a physical launcher open while disabled produces `BLOCK reason=disabled` in the watcher log and no launch
- Expected process: no `paperos` process spawned while disabled
- Expected exit code: `paperos-ctl enter` prints `enter rc=3` while disabled; `enable` `0`
- Failure stop: enter returns `0` (launched) while disabled → run rollback immediately
- Rollback: `ssh $DEV "$T/bin/paperos-ctl enable"` then `apps/planner/paper-device/rollback-lifecycle.sh`

#### 10. Safe fault injection — force readiness failure

Uses a **transient `/run` drop-in** (tmpfs; auto-gone on reboot) that swaps
`ExecStart` for a stub exiting immediately. The real binary, the committed unit
file (`$T/paperos.service`), `/etc`, and the boot target are all untouched.

```sh
ssh $DEV '
  set -e
  D=/run/systemd/system/paperos.service.d
  mkdir -p "$D"
  printf "[Service]\nExecStart=\nExecStart=/bin/sh -c \"exit 0\"\n" > "$D/faulttest.conf"
  systemctl daemon-reload
'
ssh $DEV "$T/bin/paperos-ctl enter"; echo "enter rc=$?"      # readiness times out -> recover
# ── revert the override no matter what the enter did ──
ssh $DEV '
  rm -f /run/systemd/system/paperos.service.d/faulttest.conf
  rmdir /run/systemd/system/paperos.service.d 2>/dev/null || true
  systemctl daemon-reload
'
ssh $DEV "$T/bin/paperos-ctl status | grep -E 'state|xochitl|rm_sync'"
```

- Expected state: enter drives `ENTERING_PAPEROS` → readiness timeout → `recover_to_native` → `state=NATIVE`
- Expected process: no lingering `paperos`; `xochitl=active rm_sync=active` (ExecStopPost + recover both restore it)
- Expected exit code: `enter rc=6` (launch failed, native recovered). `rc=7` = recover also failed → go to step 11
- Failure stop: after revert, `xochitl` not `active`, or `state` stuck `RECOVERY` → run recover (step 11); if still failing, native fallback `ssh $DEV $T/recover-xochitl.sh`
- Rollback: revert block above (always run it) + `apps/planner/paper-device/rollback-lifecycle.sh`

#### 11. Recover — device-side emergency return

```sh
ssh $DEV "$T/bin/paperos-ctl recover gate-check"; echo "recover rc=$?"
```

- Expected state: `state=NATIVE`
- Expected process: strays/stale locks cleared; `xochitl=active rm_sync=active paperos_procs=0`
- Expected exit code: `0` (native verified). `1` = native NOT verified
- Failure stop: recover `1` → native fallback `ssh $DEV $T/recover-xochitl.sh`; if that also fails, power-cycle the device
- Rollback: `apps/planner/paper-device/rollback-lifecycle.sh`

#### 12. Rollback (stop everything, keep files)

Stop the step-4 watcher terminal (Ctrl-C), then:

```sh
apps/planner/paper-device/rollback-lifecycle.sh
```

- Expected state: `run/` removed; `bin/` + `compat.allowed` + `launcher.uuid` retained
- Expected process: `END-STATE xochitl=active rm-sync=active paperos-procs=0 watcher-procs=0`
- Expected exit code: `0`; prints "ROLLBACK OK — native shell verified"
- Failure stop: "ROLLBACK VERIFICATION FAILED" → `ssh $DEV $T/recover-xochitl.sh`, inspect manually
- Rollback: this **is** the rollback

#### 13. Purge rollback (full uninstall)

```sh
apps/planner/paper-device/rollback-lifecycle.sh --purge
ssh $DEV 'ls '"$T"'/bin 2>/dev/null; echo "bin_gone=$?"'
```

- Expected state: `bin/`, `compat.allowed`, `launcher.uuid`, `DISABLED` all removed; native scripts (`open-paperos.sh`, `recover-xochitl.sh`, `paperos.service`) untouched
- Expected process: `END-STATE xochitl=active rm-sync=active paperos-procs=0 watcher-procs=0`
- Expected exit code: `0`; "ROLLBACK OK"; `bin_gone` non-zero (dir absent)
- Failure stop: verification fails, or native scripts missing → `ssh $DEV $T/recover-xochitl.sh`
- Rollback: re-run `deploy-lifecycle.sh` to reinstall if needed

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

## Device gate execution log — 2026-07-12 (Ken + live device)

First live run on the Paper Pro Move (`VERSION_ID=5.7.126`). Dedicated launcher
document **Open PaperOS** created; UUID `a7d91a64-9be5-45e0-8875-d96ffcd55049`.

| Step | Result | Evidence |
| ---- | ------ | -------- |
| 1 Preflight | **PASS** | native baseline; runtime absent |
| 2 Deploy | **PASS** (after fix) | see finding A |
| 3 Launcher UUID | **PASS** | bound + validated |
| 4 Watcher arm | **PASS** | `event=start`, native untouched |
| 5 Status | **PASS** | fail-closed config correct |
| 6a False positive | **PASS** | unrelated open → `IGNORE wrong-uuid`, 0 launches |
| 6b True positive | **PASS** | launcher open → 1 `LAUNCH` → `PAPEROS_ACTIVE`, 1 proc |
| 7 Exit | **PASS** | `EXITING→NATIVE`, xochitl+rm-sync active, 0 procs; screen returned, touch normal |
| 8 Restart | **PASS** | clean exit→enter cycle, exactly 1 proc |
| 9 Disable/enable | **PASS** | SSH `enter` refused `rc=3`; watcher `BLOCK reason=disabled` on physical open |
| 10 Fault injection | **INCOMPLETE** | interrupted by a device reboot — see finding C |
| 11 Recover | **not run** (superseded by Mode-A boot recovery + finding B) |
| 12–13 Purge rollback | **PASS** | `ROLLBACK OK`; all runtime files gone; native scripts 3/3 intact; Open PaperOS doc preserved |

**Finding A — deploy did not link the unit (FIXED).** After a prior reboot the
volatile `/etc` link was gone, so `systemctl start paperos` failed
`Unit not found`; the first 6b attempt therefore hit `enter → unit-start-failed
→ recover → NATIVE` — i.e. the **fail-closed recovery path executed for real and
restored native cleanly**. `deploy-lifecycle.sh` now `systemctl link`s the unit
(link ≠ enable; unit has no `[Install]`), `rollback` unlinks it.

**Finding B — `paperos_pids` false positive (FIXED).** The matcher's path-suffix
alternative matched a `ps w` line truncated at terminal width to end in
`/paperos`, so `ctl status` briefly reported `paperos_procs=1` with no app
running. Narrowed to the actual `-platform` invocation + ink candidates, helper
scripts skipped; regression test added (host suite 81/81).

**Finding C — device rebooted during fault injection (OPEN).** During step 10 the
USB session dropped; the device performed a **graceful `reboot`** (journal:
`pid … comm="reboot"`, orderly xochitl shutdown), **not** a panic/watchdog-kill.
It was **not** an OTA (`VERSION_ID` unchanged; update engine logged "No update
available"). It followed ~5 `enter`/`exit` cycles, each of which fully stops
xochitl via `Conflicts=`. Hypothesis: reMarkable device-level protection reacting
to repeated xochitl shutdown/restart. Mode A restored native on boot; the `/run`
drop-in and `/etc` link were cleared as designed. **Not isolated to a single
cause; must be investigated before persistent enablement or Mode B.** Mitigation
ideas to evaluate: reduce `READY_TIMEOUT`, avoid rapid repeated cycling in tests,
and check reMarkable boot-count/emergency behaviour under xochitl churn.

Net: the reversible enter / exit / recovery **core is validated on real
hardware** (including a genuine fail-closed recovery and a clean full purge);
fault-injection retry and explicit `recover` are deferred pending finding C.

## Guardrails held (verified on device 2026-07-12)

- Persistent systemd enabled: **NO** (`link`, never `enable`; unit has no `[Install]`)
- Permanent boot integration changed: **NO** (`/etc` link is volatile; `/run` drop-in is tmpfs; both cleared by the reboot on their own)
- Native xochitl recovery preserved: **YES** (`open-paperos.sh` / `recover-xochitl.sh` / `paperos.service` intact 3/3; Mode-A boot restored native)

## Remaining blockers before persistent enablement

1. **Finding C** — investigate the graceful reboot under repeated xochitl
   cycling; confirm safe enter/exit cadence before Mode B or persistent enable
2. Complete step 10 fault injection + step 11 explicit recover once finding C is
   understood
3. Journal token stability across OTA is observational, not contractual —
   `compat.allowed` gate is the mitigation
4. Persistent `systemctl enable` / boot integration deferred to a later gate

## Next phase after Ken gate

`PAPR.SYS.2` — sleep / wake / idle + wake sync reconciliation.
