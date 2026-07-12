# PAPR.SYS.1 — Lifecycle Runtime Implementation

**Status:** **PASS** (owner sign-off 2026-07-12) — reversible
**enter / exit / restart / recovery core + Finding C hardening validated on real
hardware**. Finding C (vendor `StartLimit`) is **RESOLVED** and device-validated;
high-frequency switching passes. Persistent enablement and Mode B are **out of
SYS.1 scope** — separate gates, still not authorized. Handoff / history at the
end of this doc.
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

- `apps/planner/paper-device/tests/sys1/run-tests.sh` (81 cases, mocked systemd)

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
6. **Finding C guard, before stopping xochitl:** vendor start-limit drift or
   xochitl-cycle budget exhausted → exit 9, xochitl left running (see
   §"SYS.1 hardening")
7. state ENTERING_PAPEROS; `systemctl start paperos` (Conflicts stops xochitl)
8. poll readiness ≤ `READY_TIMEOUT`; then a `STABLE_SECS` window so an
   instantly-dying binary is not reported active
9. success → state PAPEROS_ACTIVE, exit 0
10. any failure → `recover_to_native`; exit 6 if native restored, exit 7 if not

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
failures; `FAIL_LIMIT` (default **2** since the Finding C hardening) within
`FAIL_WINDOW` (default 300 s) latches `run/crashloop`, after which every
candidate open is blocked until `paperos-ctl arm`. Each failure additionally
forces a `FAIL_BACKOFF` pause, and a budget throttle (enter exit 9) is **not**
counted as a failure. See §"SYS.1 hardening".

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
`journalctl`. **117/117 pass, deterministic** (81 core + 36 SYS.1-hardening; see
§"SYS.1 hardening patch — implemented"). Coverage:

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

**Finding C — device rebooted during fault injection (CONFIRMED / ATTRIBUTED).**
During step 10 the USB session dropped; the device performed a **graceful
`reboot`** (journal: `pid 6390 comm="reboot"`). Read-only forensics (config +
emergency script + previous-boot journal, independently re-verified 2026-07-12)
confirmed the exact chain — **not** a watchdog, panic, or OTA:

```text
xochitl repeatedly started (exit / recover / failed-enter each START xochitl)
→ systemd StartLimitBurst=4 within StartLimitIntervalUSec=10min exceeded
→ xochitl.service: "Start request repeated too quickly" → 'start-limit-hit'
→ OnFailure=emergency.target (reMarkable override; StartLimitAction=none, so
   systemd itself takes no action — the reboot is purely reMarkable policy)
→ rm-emergency.service → /usr/sbin/rm-emergency.sh
→ unconditional `reboot` (final line, outside the swu_applied branch)
```

Confirmed artifacts (verbatim): `StartLimitIntervalUSec=10min`,
`StartLimitBurst=4`, `StartLimitAction=none`; override
`xochitl-service-override.conf` → `OnFailure=emergency.target`; base
`OnFailure=remarkable-fail.service` is **missing** (`Failed to enqueue
OnFailure= job … not found`), so `emergency.target` is the only live handler;
journal `/usr/sbin/rm-emergency.sh invoked` immediately precedes the reboot.

```text
FINAL VERDICT:
FINDING C ATTRIBUTED

Device modified: NO
PaperOS started: NO
xochitl restarted: NO
Persistent files changed: NO

Reboot timestamp: 2026-07-12 05:06:07 UTC
Reboot PID: 6390
Command: reboot
Executable: /usr/bin/systemctl
Parent PID/process: rm-emergency.sh (spawned by systemd rm-emergency.service)
UID: 0
Cgroup: /system.slice/rm-emergency.service
Systemd unit: rm-emergency.service

Timeline:
- last xochitl stop: 2026-07-12 05:06:07 UTC
- last xochitl start: shortly before 05:06:07 UTC (4th restart within 10 minutes)
- fault injection began: between 04:56:26 and 05:06:07 UTC
- reboot requested: 2026-07-12 05:06:07 UTC
- shutdown completed: shortly after 05:06:07 UTC
- next boot: immediately after

Evidence:
- direct evidence:
  - systemd journal logs `xochitl.service: Start request repeated too quickly` and `Failed with result 'start-limit-hit'`.
  - systemctl properties show `StartLimitBurst=4` and `StartLimitIntervalUSec=10min` for xochitl.service.
  - xochitl.service.d/xochitl-service-override.conf has `OnFailure=emergency.target`.
  - emergency.target requires `rm-emergency.service` which executes `/usr/sbin/rm-emergency.sh`.
  - `/usr/sbin/rm-emergency.sh` unconditionally runs `reboot`.
- supporting evidence: journalctl explicitly logs `/usr/sbin/rm-emergency.sh invoked` moments before PID 6390 called reboot.
- contradictory evidence: none

Most likely cause:
The rapid stop/start cycles of xochitl during fault injection exceeded the systemd rate limit of 4 restarts within 10 minutes. This triggered the OnFailure hook leading to emergency.target, which then unconditionally rebooted the device as a fallback safety measure.
Confidence: 100%

Lifecycle implication (owner-reviewed 2026-07-12):
- Reachable through NORMAL SYS.1 operation, not only synthetic testing. Every
  paperos-exit (ExecStopPost start xochitl), every recover_to_native, and every
  failed-enter recovery START xochitl. A few normal switches + one failed enter
  + one recovery can reach StartLimitBurst=4 within 10 min.
- FAIL_LIMIT=3 (watcher) can reach the vendor start limit BEFORE PaperOS
  crash-loop protection latches — the protection can itself provoke the
  emergency reboot.
- Manual single enter/exit: PASS. High-frequency switching / persistent watcher
  / Mode B / auto-launch-after-unlock: BLOCKED until hardened.

Required change: YES — but NOT "reset-failed on every exit/recover".
A blanket reset-failed in normal paths would bypass reMarkable's genuine
crash-loop protection (a truly crash-looping xochitl would be masked). The
correct fix PREVENTS the trigger — see §SYS.1 hardening design below.
`reset-failed` is permitted ONLY as an explicit, guarded, manual rescue.

Test-only note for rerunning fault injection: space cycles so <4 xochitl starts
per 10 min, or (test rig only) `systemctl reset-failed xochitl.service` between
cycles. A normal reboot clears the counter.
```

Net: the reversible enter / exit / recovery **core is validated on real
hardware** (including a genuine fail-closed recovery and a clean full purge);
fault-injection retry and explicit `recover` are deferred pending finding C.

## Guardrails held (verified on device 2026-07-12)

- Persistent systemd enabled: **NO** (`link`, never `enable`; unit has no `[Install]`)
- Permanent boot integration changed: **NO** (`/etc` link is volatile; `/run` drop-in is tmpfs; both cleared by the reboot on their own)
- Native xochitl recovery preserved: **YES** (`open-paperos.sh` / `recover-xochitl.sh` / `paperos.service` intact 3/3; Mode-A boot restored native)

## Gate status summary (2026-07-12)

| Item                                   | Status               |
| -------------------------------------- | -------------------- |
| Manual single enter / exit / recovery  | **PASS**             |
| Finding C (vendor StartLimit)          | **RESOLVED** (hardened + device-validated 2026-07-12) |
| High-frequency switching               | **PASS** (Finding C hardening gate, 2026-07-12) |
| SYS.1 overall                          | **PASS** (owner sign-off 2026-07-12) |
| Persistent enablement                  | **BLOCKED** (separate gate, not authorized) |
| Mode B / auto-launch-after-unlock      | **BLOCKED** (separate gate, not authorized) |

## SYS.1 hardening design (owner-directed — IMPLEMENTED 2026-07-12)

> Implemented on `agent/papr-sys-1-lifecycle-runtime`; see
> §"SYS.1 hardening patch — implemented" below for the as-built mapping, exit
> codes, and host results. The four-layer design is unchanged from the original
> owner direction and reproduced here for reference.


The fix must **prevent** reaching the vendor `StartLimit`, **preserve** reMarkable's
emergency protection, and keep `reset-failed` as a manual-only rescue. Four
layers (design only here; implementation + host tests + a constrained device
re-test belong to the hardening patch):

1. **Restart PaperOS must not bounce xochitl.** Change `restart-paperos` from
   `PaperOS → xochitl → PaperOS` to an in-place `PaperOS → PaperOS` process
   restart; fall back to xochitl only if the restart fails. Removes the most
   common xochitl-start consumer.
2. **xochitl-cycle budget, checked BEFORE stopping xochitl.** Track controlled
   xochitl restores + full enter/exit in the last 10 min; refuse (leaving native
   untouched) when over budget — suggested more conservative than vendor:
   ≤2 controlled restores / 10 min, ≥180 s between full switches. Emit
   `BLOCK reason=xochitl-cycle-budget`. Must block *before* stopping xochitl, so
   we never enter PaperOS without a safe exit budget.
3. **Lower enter-failure threshold + backoff.** First failed enter → recover →
   cooldown; a second failure in the window → latch `crashloop`, stop auto
   retries (no watcher re-arm) until manual clear. Auto enter-failure budget 1–2,
   forced backoff after each failure. Prevents FAIL_LIMIT overlapping
   `StartLimitBurst=4`.
4. **`reset-failed` = explicit manual rescue only.** e.g.
   `paperos-ctl recover-native --reset-start-limit`, gated on: PaperOS stopped,
   watcher inactive, zero PaperOS procs, state NATIVE/RECOVERY, explicit flag,
   reset once, start xochitl once, no retry, fully logged. `enter` / `exit` /
   `restart` / automatic recover must **never** call it implicitly.

Add a vendor `StartLimit` compatibility check (read `StartLimitBurst` /
`StartLimitIntervalUSec` / `OnFailure`) so the budget stays conservative relative
to whatever the current OS ships.

## SYS.1 hardening patch — implemented (2026-07-12)

Status: **PASS** — host-validated + device-validated 2026-07-12 (constrained gate
below, Ken present), **owner sign-off same day**. Finding C is **RESOLVED**: the
full authorized cadence ran without ever approaching `StartLimitBurst=4` and the
`emergency.target`/reboot path was never triggered. High-frequency switching
passes; persistent enablement / Mode B remain separately **BLOCKED** (out of
scope, own gates). Owner approved a minimal `paperos.service` `ExecStopPost` edit
(Layer 1) after confirming it preserves the always-on native fallback.

As-built mapping of the four layers:

1. **PaperOS-only restart.** `paperos-ctl restart-paperos` now detaches into an
   internal `__restart-run` worker: it sets a fresh `run/restart-intent` marker,
   runs `systemctl restart paperos`, waits readiness (reusing `READY_TIMEOUT` /
   `STABLE_SECS`), then clears the marker; on failure it falls back to
   `recover_to_native`. `paperos.service` `ExecStopPost` is now conditional —
   it skips the xochitl restore **only** while `run/restart-intent` exists and
   its epoch is within a 30 s TTL (hardcoded in the unit, mirrors
   `RESTART_INTENT_TTL` in `paperos-lib.sh`). Absent / stale / unparseable
   marker → xochitl is restored exactly as before, so the native fallback is
   intact. A restart therefore adds **zero** xochitl starts (`Conflicts=` is a
   no-op because xochitl is already stopped). `recover_to_native` clears the
   marker up front so no recovery ever honours a stale restart-intent.
2. **xochitl-cycle budget, before stopping xochitl.** `paperos-lib.sh` keeps a
   pruned ledger `run/xochitl-restores` (one epoch per controlled restore,
   written by `paperos-exit` on the ExecStopPost restore and by
   `recover_to_native`). `paperos-enter` calls `xochitl_cycle_ok` **before**
   `systemctl start paperos`: refuse with **exit 9** (xochitl untouched) when
   `≥ XOCHITL_CYCLE_MAX` (2) restores in `XOCHITL_CYCLE_WINDOW` (600 s) or
   `< MIN_SWITCH_INTERVAL` (180 s) since the last switch. It also calls
   `vendor_startlimit_ok` (`systemctl show xochitl -p StartLimitBurst
   -p StartLimitIntervalUSec -p StartLimitAction -p OnFailure`) and fails closed
   (exit 9) if the props are unreadable/unparseable, the vendor burst is not
   strictly greater than our budget, or `OnFailure` no longer names
   `emergency.target`. Skippable via `PAPEROS_SKIP_STARTLIMIT_CHECK=1`.
3. **Enter-failure threshold + backoff.** `paperos-watch` default `FAIL_LIMIT`
   lowered 3 → 2, with a forced `FAIL_BACKOFF` (180 s) sleep after each failed
   enter. The `crashloop` latch still requires manual `paperos-ctl arm`. A
   throttle (enter exit 9) is logged `enter-throttled` and does **not** count
   toward the latch.
4. **Manual-only `reset-failed`.** New `paperos-ctl recover-native
   --reset-start-limit`, gated on {paperos unit inactive, watcher stopped, 0
   PaperOS procs, state NATIVE/RECOVERY, explicit flag}; resets the limit once,
   starts xochitl once, no retry, fully logged (refuse → exit 75, missing flag →
   exit 64). `reset-failed` appears in **no** enter/exit/restart/watch/automatic
   -recover path (asserted by a host test).

**Host results:** `tests/sys1/run-tests.sh` **117/117**, deterministic across 3
consecutive runs (was 81; +36 assertions covering budget block/spacing/count,
vendor start-limit + OnFailure drift, restore-ledger recording, conditional
ExecStopPost fresh/absent/stale, two PaperOS-only restarts with **zero** xochitl
starts, restart-failure fallback, `FAIL_LIMIT=2`, throttle-not-crash, and the
reset-failed allow/refuse/absent-from-automatic-paths checks). `sh -n` clean on
all six lifecycle scripts + deploy/rollback; `git diff --check` clean. Rollback
already removes `run/` wholesale, so the new ledger/marker files need no rollback
change.

### Constrained device gate — SYS.1 hardening retest (2026-07-12, Ken present)

Run on the Paper Pro Move (`VERSION_ID=5.7.126`). The Layer 1 conditional
`ExecStopPost` was applied through a **reversible `/run` tmpfs drop-in** (the
persistent unit is normally shipped by `deploy-paperos.sh`, which
`deploy-lifecycle.sh` deliberately does not overwrite — it only `link`s it), so
the on-device `/home` unit file was never modified. xochitl real starts were
tracked live via `journalctl -b -u xochitl 'Started reMarkable main application'`.

| Step | Operation | Result | Evidence |
| ---- | --------- | ------ | -------- |
| 0 | Preflight + vendor read | **PASS** | xochitl+rm-sync active; `StartLimitBurst=4`, `OnFailure` includes `emergency.target` → `vendor_startlimit_ok` passes |
| — | Deploy + conditional ExecStopPost (`/run` drop-in) | **PASS** | effective `ExecStopPost` = restart-intent conditional; xochitl untouched by deploy |
| 1 | enter | **PASS** | rc=0, `PAPEROS_ACTIVE`, 1 proc, xochitl stopped by `Conflicts=`; start counter **1** (unchanged) |
| 2 | 2× PaperOS-only restart | **PASS** | both rc=0, `restart-done result=paperos-only`, paperos `ExecMainStartTimestamp` advanced each time, procs=1, **xochitl start counter flat at 1** |
| 3 | exit | **PASS** | rc=0, `NATIVE`, xochitl+rm-sync active; counter 1→2; restore recorded in ledger |
| 4 | fast re-enter | **PASS** | rc=9, `blocked reason=xochitl-cycle-budget` (last-switch 17s<180s) **before** xochitl stopped; xochitl still active; counter 2 |
| 5 | failed-enter recovery (fault-injected ExecStart stub) | **PASS** | rc=6, `readiness-timeout` → `recover result=native-verified`; counter 2→3; fault drop-in reverted |
| 6 | explicit recover | **PASS** | rc=0, native verified; counter **3** (start on already-active xochitl = no-op) |
| 7 | rollback `--purge` | **PASS** | `ROLLBACK OK — native shell verified`; runtime purged; unit unlinked |
| — | cleanup + final baseline | **PASS** | drop-in removed; native active; runtime absent; **same boot `05:06:12` (no reboot)**; `rm-emergency.sh invoked` this session = **0** |

**Net:** total xochitl real starts across the whole gate = **2** (exit + recovery),
never more than 2 within any 10-min window — never approached `StartLimitBurst=4`,
and the Finding C `emergency.target`/reboot chain was **never entered**. A
pre-hardening run of the same cadence would have spent 2 extra starts on the two
restarts alone. Device left pristine clean-native, no persistent changes.

Also confirmed live (informative): raising the enter budget above the vendor
burst is correctly rejected by `vendor_startlimit_ok`
(`startlimit-incompat detail=vendor-burst=4 <= budget=9`) — the vendor guard
prevents us from ever configuring a budget looser than the OS.

## Manual Mode deployment — LIVE (session-scoped, 2026-07-12)

**Status: SYS.1 Manual Mode PASS.** PaperOS is deployed under `/home` and usable
on the device via the Open PaperOS trigger, with xochitl as the boot default. No
`/usr` write, no `systemctl enable`, no boot-target change — the unit link is
per-boot (tmpfs `/etc`), so this is **session-scoped Manual Mode**, not the
deferred persistent SYS.1p.

### Deployment packaging fix

`deploy-lifecycle.sh` previously only `link`ed a pre-existing unit and never
shipped the hardened `paperos.service`. It now performs a `/home`-only deploy:

```text
repo paperos.service
  → /home/root/paperos/systemd/paperos.service     (shipped, NOT /usr)
  → systemctl link /home/root/paperos/systemd/paperos.service   (link ≠ enable)
  → systemctl daemon-reload
  → verify effective ExecStopPost carries the conditional restart-intent;
    FAIL CLOSED (exit 3) if stale — caller must not enter PaperOS
```

Guarantees (host-tested, 143/143): no `/usr` write, no root remount, no
`systemctl enable`, no boot-target change, no `/etc` persistence assumption,
xochitl never stopped, idempotent repeat deploy (`disable`+`link`). `rollback`
unlinks the session unit and preserves the `/home` install; `--purge` also
removes `/home/root/paperos/systemd/paperos.service`.

### Device smoke gate (2026-07-12, Ken present) — all steps PASS

| Step | Result | Evidence |
| ---- | ------ | -------- |
| 1 Native preflight | **PASS** | xochitl+rm-sync active, runtime absent, `get-default`=multi-user.target |
| 2 Standard deploy | **PASS** | link → `/home/root/paperos/systemd/paperos.service`, xochitl not stopped |
| 3 Deployed `/home` unit | **PASS** | `$T/systemd/paperos.service` present + hardened |
| 4 Effective ExecStopPost | **PASS** | `systemctl show` → conditional restart-intent |
| 5 Arm watcher (this boot) | **PASS** | detached watcher, `event=start` |
| 6–7 Open PaperOS → active | **PASS** | exactly one `result=LAUNCH` (right uuid) → `PAPEROS_ACTIVE`, 1 proc |
| 8–9 Restart PaperOS | **PASS** | `restart-done result=paperos-only`, `ExecMainStartTimestamp` advanced, **xochitl start count flat** |
| 10 Return to reMarkable | **PASS** | `NATIVE`, xochitl+rm-sync active, 0 procs |
| 11 Re-enter after cooldown | **PASS** | budget correctly blocked <180 s, then `enter rc=0` → `PAPEROS_ACTIVE` |
| 12 Leave active | **PASS** | `PAPEROS_ACTIVE`, 1 proc, unit still linked from `/home` |

**Net:** across the whole gate xochitl was really started once (the Return);
`StartLimitBurst=4` never approached, `emergency.target`/reboot never fired (same
boot throughout, 0 `rm-emergency` invocations). No unrelated document triggered
PaperOS. Device left with PaperOS **active** — not rolled back, not purged.

### Reboot behaviour (Manual Mode limitation)

> After a device reboot, xochitl starts normally as the default shell. PaperOS
> does **not** auto-start. The owner must re-run `deploy-lifecycle.sh` and
> re-arm the watcher, because the `/etc` unit link is on a tmpfs overlay and does
> not persist across reboot. Persistent enablement is PAPR.SYS.1p (deferred).

## Remaining blockers before persistent enablement

1. **Finding C (CONFIRMED)** — implement the SYS.1 hardening patch above; a safe
   enter/exit/restart cadence must be guaranteed before Mode B or persistent enable.
2. Complete step 10 fault injection + step 11 explicit recover **after** hardening
   (and without approaching `StartLimitBurst=4`).
3. Journal token stability across OTA is observational, not contractual —
   `compat.allowed` gate is the mitigation.
4. Persistent `systemctl enable` / boot integration deferred to a later gate.

## Handoff — for the next agent (2026-07-13)

**Branch:** `agent/papr-sys-1-lifecycle-runtime` · **Draft PR:** #20 (keep DRAFT)
**Device:** left clean + native (purged); "Open PaperOS" doc UUID
`a7d91a64-9be5-45e0-8875-d96ffcd55049` still on device.

**Done & validated (do not redo):** enter / exit / restart / disable-enable,
true+false-positive journal detection, a real fail-closed recovery, full purge
rollback — all on hardware. Host suite **81/81**. Deploy links the unit
(`link` ≠ `enable`); rollback unlinks. `paperos_pids` hardened.

**Your task = the SYS.1 hardening patch above (4 layers).** Then re-run ONLY:
one normal enter/exit; two PaperOS-only restarts (assert xochitl start count does
NOT rise); a fast re-enter that is blocked *before* xochitl stops; one safe
failed-enter recovery; one explicit recover; rollback. **Add host regression
tests** for the budget/backoff/reset-failed logic.

**Hard constraints:** do NOT start `PAPR.SYS.2`; do NOT `systemctl enable` or add
boot hooks; do NOT enable auto-launch / Mode B; do NOT run rapid cycles that
approach `StartLimitBurst=4` (≥4 xochitl starts / 10 min) — it force-reboots the
device; keep native `open-paperos.sh` / `recover-xochitl.sh` / `paperos.service`
untouched; keep PR #20 draft.

## Handoff — session paused before implementation (2026-07-11)

Owner paused this session before any code changes were made, to hand off to a
fresh agent tomorrow. **No lifecycle scripts, tests, or unit files were
modified this session** — worktree `agent/papr-sys-1-lifecycle-runtime`
(`life-os-papr-sys-1`) is clean at `a95feb14` (matches PR #20 HEAD). Baseline
host suite re-run: **81/81**, deterministic. No device access, no `systemctl`
calls, no watcher start happened this session — device state is unchanged from
the "clean native" baseline already recorded above (xochitl active, rm-sync
active, PaperOS runtime purged, watcher stopped, native fallback scripts
intact).

This session did a read-only review of every file the hardening patch will
touch, to save the next agent a discovery pass. Findings below describe
**current, pre-hardening** behavior — nothing here has been implemented yet;
verify against source before coding.

### Files reviewed (current behavior)

- `paperos-lib.sh` — state machine, `recover_to_native` (:156-174),
  `paperos_pids` (:132-139, already hardened against truncated-`ps` false
  positives per Finding B), `acquire_lock`/`release_lock` (mkdir-lock,
  :75-92), `log_line` (:61-71, rotates at 256 KB).
- `paperos-ctl` — `restart-paperos` (:68-73) is currently
  `nohup sh -c "paperos-exit && paperos-enter"` — a **full native bounce**:
  `paperos-exit` → `systemctl stop paperos` → `ExecStopPost` starts xochitl →
  `paperos-enter` → `systemctl start paperos` (`Conflicts=xochitl.service`)
  stops xochitl again. That is 1 xochitl start + 1 xochitl stop per restart —
  exactly the Finding-C-relevant cost Layer 1 must remove.
- `paperos.service` (:1-23) — **`Conflicts=xochitl.service`** and
  **`ExecStopPost=/bin/sh -c 'systemctl --no-block start xochitl'`** are
  unconditional, unit-level. This is the actual mechanism Layer 1 has to
  defeat, not something `paperos-ctl` can override on its own.
- `paperos-enter` / `paperos-exit` — idempotent handoff scripts, both call
  into `recover_to_native` on any failure.
- `paperos-recover` — steals the lifecycle lock (the emergency path), always
  safe to call, verifies xochitl + rm-sync + zero PaperOS procs.
- `paperos-watch` — `record_enter_failure` (:83-96) already has a
  fail-count/window latch (`FAIL_LIMIT=3` / `FAIL_WINDOW=300`) that writes
  `run/crashloop` — this is what Layer 3 needs to tighten to ≤2 and add
  forced backoff to.
- Test harness `tests/sys1/run-tests.sh` — 81 cases, mocked
  `systemctl`/`ps`/`kill`/`journalctl` via a `MOCK_DIR` marker-file model. New
  tests must follow the same pattern: real scripts, only systemd/process
  environment mocked.

### Architecture note — Layer 1 cannot be done in `paperos-ctl` alone

`Conflicts=` and `ExecStopPost=` are enforced by systemd at the unit level,
not by our scripts. A plain `systemctl stop paperos; systemctl start paperos`
(or `systemctl restart paperos`) will **always** fire `ExecStopPost` (starts
xochitl) and then **always** trigger `Conflicts=` on the next start (stops
xochitl again) — regardless of any restart-intent bookkeeping added to
`paperos-ctl`. A true "PaperOS-only restart" therefore likely requires making
`ExecStopPost` itself conditional on a restart-intent marker, e.g.:

```ini
ExecStopPost=/bin/sh -c 'test -e $RUN_DIR/restart-intent || systemctl --no-block start xochitl'
```

— i.e. `apps/planner/paper-device/paperos.service` probably needs a
coordinated edit alongside `paperos-ctl`, not just the ctl script in
isolation. The marker must live in the volatile runtime dir (`$RUN_DIR`,
already `$PAPEROS_HOME/run`) per the task spec, and `paperos-lib.sh` will
likely need small `restart_intent_set` / `restart_intent_clear` /
`restart_intent_stale` helpers so `paperos-ctl`, the unit's `ExecStopPost`,
and `paperos-recover` all agree on the same marker and its staleness rules.
**This is inference from the committed unit file, not device-verified** —
confirm against real `systemctl show paperos -p Conflicts -p ExecStopPost`
behavior (or equivalent host-mock coverage) before committing to the design.

### Untouched from here: the four-layer spec

The full design (restart semantics, cycle budget, failure threshold/backoff,
manual-only `reset-failed`) is already written above in **"SYS.1 hardening
design"** and in the original task brief — unchanged, still the target. This
session did not revise that spec, only mapped it onto the actual source so
implementation can start immediately.

### Next agent starting checklist

1. Re-run baseline: `apps/planner/paper-device/tests/sys1/run-tests.sh` →
   expect 81/81 before touching anything.
2. Implement Layer 1: `paperos-ctl restart-paperos` + `paperos.service`
   `ExecStopPost` conditional + `paperos-lib.sh` restart-intent helpers +
   `paperos-recover`/crash-path cleanup of stale markers. Must log
   `restart-intent` / `normal-exit` / `unexpected-crash` /
   `restart-failure-recovery` distinctly.
3. Implement Layer 2: read + validate vendor `StartLimitIntervalUSec` /
   `StartLimitBurst` / `StartLimitAction` / `OnFailure` via `systemctl show
   xochitl`; fail closed to `INCOMPATIBLE` if unparseable, missing, stricter
   than PaperOS's budget, or `OnFailure` no longer includes
   `emergency.target`; enforce PaperOS's own ≤2 restores / 10 min, ≥180 s
   spacing (or a documented equivalent) before any xochitl-stopping enter —
   must block *before* xochitl is stopped.
4. Implement Layer 3: tighten `FAIL_LIMIT` to ≤2 in `paperos-watch`, add
   forced backoff after each failure, latch requires manual
   `paperos-ctl arm` to clear (already exists) — watcher must not
   auto-retry past the threshold.
5. Implement Layer 4 only if in scope this pass
   (`paperos-ctl recover-native --reset-start-limit`, all preconditions
   gated per the brief) — otherwise leave unimplemented and document the
   manual rescue policy explicitly; `reset-failed` must not appear anywhere
   in normal enter/exit/restart/watcher/automatic-recover paths.
6. Add the 20 host regression tests listed in the task brief to
   `tests/sys1/run-tests.sh`; run 3× for determinism.
7. `sh -n` all six lifecycle scripts + `deploy-lifecycle.sh` +
   `rollback-lifecycle.sh`; `git diff --check`.
8. Update this doc + `lifecycle/README.md` with real results — do **not**
   mark SYS.1 PASS; commit + push the feature branch; keep PR #20 draft.

## Next phase (after hardening + Ken re-gate)

Two follow-on tracks were authorized after SYS.1 PASS:

- **`PAPR.SYS.1p`** — persistent Mode A (systemd-enabled watcher, survives
  reboot; xochitl stays default, Open PaperOS stays the only trigger). Owner
  authorized the design 2026-07-12; **investigation complete, implementation
  DEFERRED** — this device's `/etc` is a tmpfs overlay, so true persistence
  needs a write into the read-only root partition, which is a bigger
  escalation than "everything in `/home`." See
  [`paperos-device-lifecycle-sys1p-persistent.md`](./paperos-device-lifecycle-sys1p-persistent.md)
  for the full architecture finding, options, and the Option-A implementation
  sketch to resume from.
- **`PAPR.SYS.2`** — sleep / wake / idle + wake sync reconciliation. **Not
  authorized yet**; was always gated on SYS.1 hardening landing (now has) and
  remains a separate owner go-ahead.
