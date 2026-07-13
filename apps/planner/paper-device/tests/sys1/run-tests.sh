#!/bin/bash
# PAPR.SYS.1 host test harness. Runs the REAL device scripts (POSIX sh) against
# mocked systemctl/ps/kill/journalctl. No device required; no failure masking —
# any failed assertion fails the suite.
#
# Usage: apps/planner/paper-device/tests/sys1/run-tests.sh
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
LIFECYCLE="$(cd "$HERE/../../lifecycle" && pwd)"
UUID="aaaabbbb-cccc-4ddd-8eee-ffff00001111"
OTHER_UUID="11112222-3333-4444-5555-666677778888"

PASS=0
FAIL=0
CURRENT=""

fail() { echo "FAIL [$CURRENT] $*"; FAIL=$((FAIL + 1)); }
ok() { PASS=$((PASS + 1)); }

assert_eq() { # actual expected label
  if [ "$1" = "$2" ]; then ok; else fail "$3: expected '$2', got '$1'"; fi
}
assert_contains() { # haystack needle label
  case "$1" in *"$2"*) ok ;; *) fail "$3: missing '$2' in: $1" ;; esac
}
assert_file() { if [ -e "$1" ]; then ok; else fail "$2: missing $1"; fi; }
assert_no_file() { if [ ! -e "$1" ]; then ok; else fail "$2: unexpected $1"; fi; }

# ── Environment factory ───────────────────────────────────────────────────────
setup() { # test-name
  CURRENT="$1"
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/sys1-test.XXXXXX")"
  HOME_DIR="$TMP/paperos"
  MOCK="$TMP/mock"
  SHIM="$TMP/shim"
  STORE="$TMP/store"
  mkdir -p "$HOME_DIR/run" "$MOCK" "$SHIM" "$STORE"

  echo "$UUID" > "$HOME_DIR/launcher.uuid"
  echo "3.22.0" > "$HOME_DIR/compat.allowed"
  printf 'ID=remarkable\nVERSION_ID="3.22.0"\n' > "$TMP/os-release"
  touch "$STORE/$UUID.metadata"
  printf '#!/bin/sh\nexit 0\n' > "$HOME_DIR/paperos"
  chmod 755 "$HOME_DIR/paperos"

  # systemctl shim: models xochitl/rm-sync/paperos with Conflicts=,
  # conditional-ExecStopPost, and StartLimit `show` semantics via marker files
  # in $MOCK. $S/xochitl-starts counts every real xochitl (re)start (start cmd
  # or an ExecStopPost restore) — the Finding-C signal the restart test asserts.
  cat > "$SHIM/systemctl" <<'EOSH'
#!/bin/sh
S="$MOCK_DIR"
cmd="${1:-}"; unit="${2:-}"
echo "$cmd $unit" >> "$S/systemctl.calls"

# Count a xochitl start only on a genuine inactive->active transition, and
# honour the xochitl-start-fail marker (models "xochitl genuinely cannot start").
xochitl_up() {
  [ -e "$S/xochitl-start-fail" ] && return 1
  [ -e "$S/xochitl-active" ] || echo x >> "$S/xochitl-starts"
  touch "$S/xochitl-active"
}
# Mirror of paperos.service ExecStopPost: skip the xochitl restore only while a
# FRESH restart-intent marker exists (TTL matches RESTART_INTENT_TTL).
restart_intent_fresh() {
  m="${PAPEROS_HOME:-/home/root/paperos}/run/restart-intent"
  [ -f "$m" ] || return 1
  ts=$(cat "$m" 2>/dev/null)
  case "$ts" in ''|*[!0-9]*) return 1 ;; esac
  now=$(date +%s); age=$((now - ts))
  [ "$age" -ge 0 ] && [ "$age" -le "${PAPEROS_RESTART_INTENT_TTL:-30}" ]
}
paperos_stoppost() {
  # ExecStopPost: restore xochitl unless a fresh restart-intent says otherwise.
  restart_intent_fresh || xochitl_up
}

case "$cmd" in
  is-active)
    case "$unit" in
      xochitl)
        if [ -e "$S/xochitl-active" ]; then echo active; exit 0; fi
        echo inactive; exit 3 ;;
      rm-sync)
        if [ -e "$S/xochitl-active" ] && [ ! -e "$S/rmsync-fail" ]; then echo active; exit 0; fi
        echo inactive; exit 3 ;;
      paperos)
        if [ -e "$S/paperos-running" ]; then echo active; exit 0; fi
        echo inactive; exit 3 ;;
    esac ;;
  start)
    case "$unit" in
      xochitl)
        [ -e "$S/xochitl-start-fail" ] && exit 1
        xochitl_up ;;
      paperos)
        rm -f "$S/xochitl-active"
        [ -e "$S/paperos-start-fail" ] && exit 1
        [ -e "$S/paperos-not-ready" ] || touch "$S/paperos-running" ;;
    esac ;;
  stop)
    case "$unit" in
      xochitl) rm -f "$S/xochitl-active" ;;
      paperos)
        rm -f "$S/paperos-running"
        paperos_stoppost ;;
    esac ;;
  restart)
    case "$unit" in
      paperos)
        # stop (conditional ExecStopPost) then start (Conflicts stops xochitl)
        rm -f "$S/paperos-running"
        paperos_stoppost
        rm -f "$S/xochitl-active"
        [ -e "$S/paperos-start-fail" ] && exit 1
        [ -e "$S/paperos-not-ready" ] || touch "$S/paperos-running" ;;
    esac ;;
  show)
    # StartLimit / OnFailure props for vendor_startlimit_ok. Overridable per
    # test via MOCK_STARTLIMIT_* env; defaults model the real device.
    echo "StartLimitBurst=${MOCK_STARTLIMIT_BURST:-4}"
    echo "StartLimitIntervalUSec=${MOCK_STARTLIMIT_INTERVAL:-10min}"
    echo "StartLimitAction=${MOCK_STARTLIMIT_ACTION:-none}"
    echo "OnFailure=${MOCK_STARTLIMIT_ONFAILURE:-emergency.target}" ;;
esac
exit 0
EOSH

  # ps shim: fake process table driven by marker files.
  cat > "$SHIM/ps" <<'EOSH'
#!/bin/sh
S="$MOCK_DIR"
echo "  PID USER       VSZ STAT COMMAND"
[ -e "$S/paperos-running" ] && echo "  321 root      1000 S    /home/root/paperos/paperos -platform epaper"
[ -e "$S/stray-paperos" ]   && echo "  322 root      1000 S    /home/root/paperos/paperos -platform epaper"
echo "  999 root       500 S    sh"
exit 0
EOSH

  # kill shim (PAPEROS_KILL): "killing" a fake pid clears its marker.
  cat > "$SHIM/fake-kill" <<'EOSH'
#!/bin/sh
S="$MOCK_DIR"
for a in "$@"; do
  case "$a" in
    321) rm -f "$S/paperos-running" ;;
    322) rm -f "$S/stray-paperos" ;;
  esac
done
exit 0
EOSH
  chmod 755 "$SHIM/systemctl" "$SHIM/ps" "$SHIM/fake-kill"

  ENV=(
    "PATH=$SHIM:$PATH"
    "MOCK_DIR=$MOCK"
    "PAPEROS_HOME=$HOME_DIR"
    "PAPEROS_OS_RELEASE=$TMP/os-release"
    "PAPEROS_XOCHITL_STORE=$STORE"
    "PAPEROS_KILL=$SHIM/fake-kill"
    "PAPEROS_READY_TIMEOUT=2"
    "PAPEROS_STABLE_SECS=0"
    "PAPEROS_NATIVE_TIMEOUT=2"
    "PAPEROS_STOP_TIMEOUT=1"
    "PAPEROS_KILL_GRACE=0"
  )
}

run_env() { env "${ENV[@]}" "$@"; }

# Journal fixture helpers (short-unix format; ts on the entry's first line).
NOW=1752230400
event_lines() { # uuid [ts]
  local ts="${2:-$NOW}"
  printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open\n' "$ts"
  printf 'EntityOpen::open:\n'
  printf 'EntityId{%s}\n' "$1"
}
parse_with_now() { # stdin -> decisions, frozen clock
  run_env env "PAPEROS_WATCH_NOW=$NOW" "$LIFECYCLE/paperos-watch" --parse
}

# ══ Watcher parse-mode tests ══════════════════════════════════════════════════

setup "watch: exact accepted journal event -> LAUNCH"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "LAUNCH" "decision"

setup "watch: single-line event variant -> LAUNCH"
out="$(printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open EntityOpen::open: EntityId{%s}\n' "$NOW" "$UUID" | parse_with_now)"
assert_eq "$out" "LAUNCH" "decision"

setup "watch: wrong UUID -> IGNORE"
out="$(event_lines "$OTHER_UUID" | parse_with_now)"
assert_eq "$out" "IGNORE reason=wrong-uuid" "decision"

setup "watch: partial UUID -> IGNORE"
out="$(event_lines "aaaabbbb-cccc" | parse_with_now)"
assert_eq "$out" "IGNORE reason=wrong-uuid" "decision"

setup "watch: malformed EntityId line -> IGNORE, no launch"
out="$( { printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open\n' "$NOW"
          printf 'EntityOpen::open:\n'
          printf 'EntityId{%s\n' "$UUID"; } | parse_with_now)"
assert_eq "$out" "IGNORE reason=malformed-entity" "decision"

setup "watch: duplicate event -> one LAUNCH, one duplicate BLOCK"
out="$( { event_lines "$UUID"; event_lines "$UUID"; } | parse_with_now)"
assert_eq "$out" "LAUNCH
BLOCK reason=duplicate" "decision"

setup "watch: burst of 5 events -> exactly one LAUNCH"
out="$( { for _ in 1 2 3 4 5; do event_lines "$UUID"; done; } | parse_with_now)"
assert_eq "$(echo "$out" | grep -c '^LAUNCH$')" "1" "launch count"
assert_eq "$(echo "$out" | grep -c 'duplicate')" "4" "duplicate blocks"

setup "watch: unrelated indexing/sync noise -> no decisions at all"
out="$( { printf '%s.100000 remarkable xochitl[812]: rm.docworker -> worker on %s now running\n' "$NOW" "$UUID"
          printf '%s.200000 remarkable xochitl[812]: rm.documentlockmanager Opening document in unlocked mode: %s\n' "$NOW" "$UUID"
          printf '%s.300000 remarkable xochitl[812]: rm.sync.ext indexing thumbnails\n' "$NOW"
          printf '%s.400000 remarkable xochitl[812]: EntityId{%s}\n' "$NOW" "$UUID"; } | parse_with_now)"
assert_eq "$out" "" "no decision for noise (EntityId without EntityOpen must not launch)"

setup "watch: pending window expires after unrelated lines"
out="$( { printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open\n' "$NOW"
          printf 'EntityOpen::open:\n'
          printf 'noise 1\nnoise 2\nnoise 3\n'
          printf 'EntityId{%s}\n' "$UUID"; } | parse_with_now)"
assert_eq "$out" "" "late EntityId after window must not launch"

setup "watch: disabled marker -> BLOCK"
touch "$HOME_DIR/DISABLED"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "BLOCK reason=disabled" "decision"

setup "watch: crashloop marker -> BLOCK"
touch "$HOME_DIR/run/crashloop"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "BLOCK reason=crashloop" "decision"

setup "watch: incompatible OS version -> BLOCK"
echo "3.99.9" > "$HOME_DIR/compat.allowed"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "BLOCK reason=incompatible" "decision"

setup "watch: missing compat allowlist -> BLOCK (fail closed)"
rm "$HOME_DIR/compat.allowed"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "BLOCK reason=incompatible" "decision"

setup "watch: launcher document deleted from store -> BLOCK"
rm "$STORE/$UUID.metadata"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "BLOCK reason=launcher-missing" "decision"

setup "watch: stale event (replay) -> BLOCK"
out="$(event_lines "$UUID" $((NOW - 120)) | parse_with_now)"
assert_contains "$out" "BLOCK reason=stale" "decision"

setup "watch: event without parseable timestamp -> BLOCK (fail closed)"
out="$( { printf 'rm.library.ext.open\nEntityOpen::open:\nEntityId{%s}\n' "$UUID"; } | parse_with_now)"
assert_eq "$out" "BLOCK reason=no-timestamp" "decision"

setup "watch: lifecycle state PAPEROS_ACTIVE -> BLOCK"
echo "PAPEROS_ACTIVE 2026-07-11T00:00:00Z" > "$HOME_DIR/run/state"
out="$(event_lines "$UUID" | parse_with_now)"
assert_eq "$out" "BLOCK reason=state-PAPEROS_ACTIVE" "decision"

setup "watch: missing launcher.uuid -> watcher refuses to run"
rm "$HOME_DIR/launcher.uuid"
event_lines "$UUID" | parse_with_now >/dev/null 2>&1
assert_eq "$?" "4" "exit code"

setup "watch: malformed launcher.uuid -> watcher refuses to run"
echo "not-a-uuid" > "$HOME_DIR/launcher.uuid"
event_lines "$UUID" | parse_with_now >/dev/null 2>&1
assert_eq "$?" "4" "exit code"

# ══ paperos-enter tests ═══════════════════════════════════════════════════════

setup "enter: success handoff"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "PAPEROS_ACTIVE" "state"
assert_file "$MOCK/paperos-running" "paperos process"
assert_no_file "$MOCK/xochitl-active" "xochitl stopped by Conflicts"

setup "enter: repeated enter is idempotent"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "second enter exit code"
assert_eq "$(grep -c 'comp=enter .*event=noop' "$HOME_DIR/run/lifecycle.log")" "1" "noop logged once"
assert_eq "$(grep -c '^start paperos$' "$MOCK/systemctl.calls")" "1" "unit started exactly once"

setup "enter: binary missing -> refuse, xochitl untouched"
touch "$MOCK/xochitl-active"
rm "$HOME_DIR/paperos"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "5" "exit code"
assert_file "$MOCK/xochitl-active" "xochitl still active"
assert_no_file "$MOCK/systemctl.calls" "no systemctl calls at all"

setup "enter: DISABLED marker -> refuse"
touch "$MOCK/xochitl-active" "$HOME_DIR/DISABLED"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "3" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "DISABLED" "state"
assert_file "$MOCK/xochitl-active" "xochitl still active"

setup "enter: incompatible version -> refuse"
touch "$MOCK/xochitl-active"
echo "3.99.9" > "$HOME_DIR/compat.allowed"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "4" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "INCOMPATIBLE" "state"
assert_file "$MOCK/xochitl-active" "xochitl still active"

setup "enter: readiness failure -> xochitl recovered"
touch "$MOCK/xochitl-active" "$MOCK/paperos-not-ready"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "6" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "NATIVE" "state recovered"
assert_file "$MOCK/xochitl-active" "xochitl restored"

setup "enter: unit start failure -> xochitl recovered"
touch "$MOCK/xochitl-active" "$MOCK/paperos-start-fail"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "6" "exit code"
assert_file "$MOCK/xochitl-active" "xochitl restored"

setup "enter: launch fails AND xochitl restart fails -> RECOVERY state, exit 7"
touch "$MOCK/xochitl-active" "$MOCK/paperos-not-ready" "$MOCK/xochitl-start-fail"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "7" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "RECOVERY" "state"

# ══ paperos-exit tests ════════════════════════════════════════════════════════

setup "exit: normal exit restores native"
touch "$MOCK/paperos-running"
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "NATIVE" "state"
assert_file "$MOCK/xochitl-active" "xochitl active"
assert_no_file "$MOCK/paperos-running" "paperos gone"

setup "exit: repeated exit is idempotent"
touch "$MOCK/paperos-running"
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "second exit code"
assert_eq "$(grep -c 'comp=exit .*event=noop' "$HOME_DIR/run/lifecycle.log")" "1" "noop logged once"
assert_eq "$(grep -c '^stop paperos$' "$MOCK/systemctl.calls")" "1" "unit stopped exactly once"

setup "exit: stray manual process is escalated and killed"
touch "$MOCK/xochitl-active" "$MOCK/stray-paperos"
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "exit code"
assert_no_file "$MOCK/stray-paperos" "stray killed"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "NATIVE" "state"

setup "exit: rm-sync fails to return -> RECOVERY state, exit 8"
touch "$MOCK/paperos-running" "$MOCK/rmsync-fail"
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "8" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "RECOVERY" "state"

# ══ paperos-recover tests ═════════════════════════════════════════════════════

setup "recover: cleans strays, stale locks, restores native"
touch "$MOCK/stray-paperos"
mkdir -p "$HOME_DIR/run/lock.lifecycle"
echo 99999999 > "$HOME_DIR/run/lock.lifecycle/pid"
run_env "$LIFECYCLE/paperos-recover" test-reason >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "NATIVE" "state"
assert_no_file "$MOCK/stray-paperos" "stray killed"
assert_no_file "$HOME_DIR/run/lock.lifecycle" "stale lock cleared"
assert_contains "$(cat "$HOME_DIR/run/lifecycle.log")" "reason=test-reason" "reason recorded"

setup "recover: repeated recover is idempotent"
run_env "$LIFECYCLE/paperos-recover" r1 >/dev/null 2>&1
run_env "$LIFECYCLE/paperos-recover" r2 >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "second recover exit code"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "NATIVE" "state"

# ══ Watcher run-mode tests (real journalctl pipeline with shims) ══════════════

setup "watch run: live event triggers exactly one enter"
touch "$MOCK/xochitl-active"
cat > "$SHIM/journalctl" <<EOSH
#!/bin/sh
now=\$(date +%s)
printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open\n' "\$now"
printf 'EntityOpen::open:\n'
printf 'EntityId{$UUID}\n'
sleep 2
EOSH
chmod 755 "$SHIM/journalctl"
cat > "$TMP/fake-enter" <<EOSH
#!/bin/sh
echo run >> "$MOCK/enter.calls"
exit 0
EOSH
chmod 755 "$TMP/fake-enter"
run_env env "PAPEROS_ENTER_CMD=$TMP/fake-enter" "PAPEROS_WATCH_MAX_RESTARTS=0" \
  "PAPEROS_WATCH_RESTART_DELAY=0" "$LIFECYCLE/paperos-watch" >/dev/null 2>&1
assert_eq "$(wc -l < "$MOCK/enter.calls" | tr -d ' ')" "1" "enter called once"
assert_file "$HOME_DIR/run/watcher.exhausted" "exhausted latch after budget 0"

setup "watch run: FAIL_LIMIT=2 -> 2 enter failures latch crashloop; later events blocked"
touch "$MOCK/xochitl-active"
cat > "$SHIM/journalctl" <<EOSH
#!/bin/sh
now=\$(date +%s)
for i in 1 2 3 4; do
  printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open\n' "\$now"
  printf 'EntityOpen::open:\n'
  printf 'EntityId{$UUID}\n'
done
sleep 2
EOSH
chmod 755 "$SHIM/journalctl"
cat > "$TMP/fail-enter" <<EOSH
#!/bin/sh
echo run >> "$MOCK/enter.calls"
exit 6
EOSH
chmod 755 "$TMP/fail-enter"
run_env env "PAPEROS_ENTER_CMD=$TMP/fail-enter" "PAPEROS_WATCH_MAX_RESTARTS=0" \
  "PAPEROS_WATCH_RESTART_DELAY=0" "PAPEROS_WATCH_COOLDOWN=0" \
  "PAPEROS_WATCH_FAIL_BACKOFF=0" \
  "$LIFECYCLE/paperos-watch" >/dev/null 2>&1
assert_eq "$(wc -l < "$MOCK/enter.calls" | tr -d ' ')" "2" "enter attempts capped at FAIL_LIMIT=2"
assert_file "$HOME_DIR/run/crashloop" "crashloop latched"
assert_contains "$(cat "$HOME_DIR/run/lifecycle.log")" "reason=crashloop" "later events blocked by crashloop"

setup "watch run: enter throttled (rc=9) does NOT count toward crashloop"
touch "$MOCK/xochitl-active"
cat > "$SHIM/journalctl" <<EOSH
#!/bin/sh
now=\$(date +%s)
for i in 1 2 3 4 5; do
  printf '%s.350000 remarkable xochitl[812]: rm.library.ext.open\n' "\$now"
  printf 'EntityOpen::open:\n'
  printf 'EntityId{$UUID}\n'
done
sleep 2
EOSH
chmod 755 "$SHIM/journalctl"
cat > "$TMP/throttle-enter" <<EOSH
#!/bin/sh
echo run >> "$MOCK/enter.calls"
exit 9
EOSH
chmod 755 "$TMP/throttle-enter"
run_env env "PAPEROS_ENTER_CMD=$TMP/throttle-enter" "PAPEROS_WATCH_MAX_RESTARTS=0" \
  "PAPEROS_WATCH_RESTART_DELAY=0" "PAPEROS_WATCH_COOLDOWN=0" \
  "PAPEROS_WATCH_FAIL_BACKOFF=0" \
  "$LIFECYCLE/paperos-watch" >/dev/null 2>&1
assert_no_file "$HOME_DIR/run/crashloop" "throttle (rc=9) must not latch crashloop"
assert_contains "$(cat "$HOME_DIR/run/lifecycle.log")" "event=enter-throttled" "throttle logged"

setup "watch run: journal restart budget -> exhausted latch, watcher exits"
touch "$MOCK/xochitl-active"
printf '#!/bin/sh\nexit 0\n' > "$SHIM/journalctl"
chmod 755 "$SHIM/journalctl"
run_env env "PAPEROS_WATCH_MAX_RESTARTS=2" "PAPEROS_WATCH_RESTART_DELAY=0" \
  "$LIFECYCLE/paperos-watch" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "1" "exit code"
assert_file "$HOME_DIR/run/watcher.exhausted" "exhausted latch"
assert_eq "$(grep -c 'event=journal-restart' "$HOME_DIR/run/lifecycle.log")" "2" "restarts bounded"

setup "watch run: exhausted latch blocks watcher start"
touch "$MOCK/xochitl-active" "$HOME_DIR/run/watcher.exhausted"
printf '#!/bin/sh\nexit 0\n' > "$SHIM/journalctl"
chmod 755 "$SHIM/journalctl"
run_env "$LIFECYCLE/paperos-watch" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "5" "exit code"

# ══ paperos-ctl tests ═════════════════════════════════════════════════════════

setup "ctl: disable/enable/arm round-trip"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-ctl" disable >/dev/null 2>&1
assert_file "$HOME_DIR/DISABLED" "disable marker"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
assert_eq "$?" "3" "enter blocked while disabled"
run_env "$LIFECYCLE/paperos-ctl" enable >/dev/null 2>&1
assert_no_file "$HOME_DIR/DISABLED" "marker cleared"
touch "$HOME_DIR/run/crashloop" "$HOME_DIR/run/watcher.exhausted"
run_env "$LIFECYCLE/paperos-ctl" arm >/dev/null 2>&1
assert_no_file "$HOME_DIR/run/crashloop" "crashloop cleared"
assert_no_file "$HOME_DIR/run/watcher.exhausted" "exhausted cleared"

setup "ctl: status reports runtime state"
touch "$MOCK/xochitl-active"
out="$(run_env "$LIFECYCLE/paperos-ctl" status 2>/dev/null)"
assert_contains "$out" "state=" "state line"
assert_contains "$out" "xochitl=active" "xochitl line"
assert_contains "$out" "compat=ok" "compat line"
assert_contains "$out" "launcher_uuid=$UUID" "uuid line"

# ══ paperos_pids false-positive exclusion (regression: truncated /paperos) ════

setup "paperos_pids: excludes helpers + truncated path, matches only the app"
cat > "$SHIM/ps" <<'EOSH'
#!/bin/sh
echo "  PID USER       VSZ STAT COMMAND"
echo "  100 root      6924 S    {paperos-watch} /bin/sh /home/root/paperos/bin/paperos-watch"
echo "  101 root      6924 S    /bin/sh /home/root/paperos/bin/paperos-ctl status"
echo "  102 root      6792 S    -sh --login -c echo hi   /home/root/paperos/bin/paperos"
echo "  103 root       500 S    journalctl -fu xochitl -n 0 -o short-unix"
echo "  104 root      1000 S    /home/root/paperos/paperos -platform epaper"
exit 0
EOSH
chmod 755 "$SHIM/ps"
out="$(run_env sh -c '. "$0"; paperos_pids | tr "\n" " "' "$LIFECYCLE/paperos-lib.sh")"
assert_eq "$(echo $out)" "104" "only the real -platform app pid, helpers+truncated-path excluded"

# ══ SYS.1 hardening — Layer 2: xochitl-cycle budget + vendor start-limit ══════

setup "exit: records a xochitl restore in the cycle ledger"
touch "$MOCK/paperos-running"
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1
assert_file "$HOME_DIR/run/xochitl-restores" "restore ledger written"
assert_eq "$(grep -c '^[0-9]' "$HOME_DIR/run/xochitl-restores")" "1" "one restore recorded"

setup "enter: fast re-enter after exit is blocked BEFORE xochitl stops (spacing)"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1     # enter #1 -> paperos up
run_env "$LIFECYCLE/paperos-exit" >/dev/null 2>&1      # exit -> records restore ~now
rm -f "$MOCK/systemctl.calls"                          # focus on the blocked re-enter
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1     # enter #2 -> within MIN_SWITCH_INTERVAL
rc=$?
assert_eq "$rc" "9" "re-enter blocked rc 9"
assert_file "$MOCK/xochitl-active" "xochitl untouched (still active)"
assert_no_file "$MOCK/paperos-running" "paperos NOT started"
_n=$(grep -c 'start paperos' "$MOCK/systemctl.calls" 2>/dev/null); assert_eq "${_n:-0}" "0" "xochitl never stopped (no start paperos)"
assert_contains "$(cat "$HOME_DIR/run/lifecycle.log")" "reason=xochitl-cycle-budget" "budget block logged"

setup "enter: over cycle-count budget (>=MAX restores in window) is blocked"
touch "$MOCK/xochitl-active"
NOW_S=$(date +%s)
printf '%s\n%s\n' "$NOW_S" "$NOW_S" > "$HOME_DIR/run/xochitl-restores"
run_env env "PAPEROS_MIN_SWITCH_INTERVAL=0" "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "9" "count budget block rc 9"
assert_file "$MOCK/xochitl-active" "xochitl untouched on count block"

setup "enter: vendor start-limit not stricter than budget -> block (fail closed)"
touch "$MOCK/xochitl-active"
run_env env "MOCK_STARTLIMIT_BURST=2" "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "9" "vendor burst<=budget blocks"
assert_file "$MOCK/xochitl-active" "xochitl untouched on start-limit block"

setup "enter: OnFailure drift (no emergency.target) -> block"
touch "$MOCK/xochitl-active"
run_env env "MOCK_STARTLIMIT_ONFAILURE=remarkable-fail.service" "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "9" "onfailure drift blocks"

setup "enter: within budget still succeeds (empty ledger)"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "budget allows a fresh enter"
assert_file "$MOCK/paperos-running" "paperos started"

# ══ SYS.1 hardening — Layer 1: PaperOS-only restart + conditional ExecStopPost ═

setup "restart-intent: fresh marker suppresses ExecStopPost xochitl restore"
run_env sh -c '. "$0"; restart_intent_set' "$LIFECYCLE/paperos-lib.sh"
touch "$MOCK/paperos-running"
run_env systemctl stop paperos >/dev/null 2>&1
assert_no_file "$MOCK/xochitl-active" "fresh intent -> xochitl NOT restored"

setup "restart-intent: absent marker -> ExecStopPost restores xochitl"
touch "$MOCK/paperos-running"
run_env systemctl stop paperos >/dev/null 2>&1
assert_file "$MOCK/xochitl-active" "no intent -> xochitl restored"

setup "restart-intent: stale marker -> ExecStopPost restores xochitl"
echo 100 > "$HOME_DIR/run/restart-intent"    # epoch 100 (1970) = stale
touch "$MOCK/paperos-running"
run_env systemctl stop paperos >/dev/null 2>&1
assert_file "$MOCK/xochitl-active" "stale intent -> xochitl restored"

setup "restart-paperos: two PaperOS-only restarts add ZERO xochitl starts"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1      # xochitl down, paperos up
run_env "$LIFECYCLE/paperos-ctl" __restart-run >/dev/null 2>&1
rc1=$?
run_env "$LIFECYCLE/paperos-ctl" __restart-run >/dev/null 2>&1
rc2=$?
assert_eq "$rc1" "0" "first restart rc 0"
assert_eq "$rc2" "0" "second restart rc 0"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "PAPEROS_ACTIVE" "state after restart"
assert_file "$MOCK/paperos-running" "paperos running after restart"
assert_no_file "$MOCK/xochitl-active" "xochitl stayed down (Conflicts, never restored)"
assert_eq "$([ -f "$MOCK/xochitl-starts" ] && wc -l < "$MOCK/xochitl-starts" | tr -d ' ' || echo 0)" "0" "Finding C: xochitl start count did NOT rise"

setup "restart-paperos: failed restart falls back to native (xochitl restored)"
touch "$MOCK/xochitl-active"
run_env "$LIFECYCLE/paperos-enter" >/dev/null 2>&1      # paperos up, xochitl down
touch "$MOCK/paperos-not-ready"                         # restart cannot come ready
run_env "$LIFECYCLE/paperos-ctl" __restart-run >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "fallback recovered native -> rc 0"
assert_eq "$(run_env sh -c '. "$0"; get_state' "$LIFECYCLE/paperos-lib.sh")" "NATIVE" "state native after fallback"
assert_file "$MOCK/xochitl-active" "xochitl restored on restart fallback"

# ══ SYS.1 hardening — Layer 4: manual-only reset-failed rescue ════════════════

setup "ctl recover-native --reset-start-limit: resets + starts xochitl when native-safe"
echo "NATIVE 2026-07-12T00:00:00Z" > "$HOME_DIR/run/state"
run_env "$LIFECYCLE/paperos-ctl" recover-native --reset-start-limit >/dev/null 2>&1
rc=$?
assert_eq "$rc" "0" "rescue rc 0"
assert_contains "$(cat "$MOCK/systemctl.calls")" "reset-failed xochitl.service" "reset-failed invoked once"
assert_file "$MOCK/xochitl-active" "xochitl started by rescue"

setup "ctl recover-native --reset-start-limit: refused while PaperOS active"
touch "$MOCK/paperos-running"
run_env "$LIFECYCLE/paperos-ctl" recover-native --reset-start-limit >/dev/null 2>&1
rc=$?
assert_eq "$rc" "75" "refused rc 75"
_n=$(grep -c 'reset-failed' "$MOCK/systemctl.calls" 2>/dev/null); assert_eq "${_n:-0}" "0" "reset-failed NOT called when refused"

setup "ctl recover-native without flag -> usage error, no reset"
run_env "$LIFECYCLE/paperos-ctl" recover-native >/dev/null 2>&1
rc=$?
assert_eq "$rc" "64" "missing flag rc 64"
_n=$(grep -c 'reset-failed' "$MOCK/systemctl.calls" 2>/dev/null); assert_eq "${_n:-0}" "0" "no reset without explicit flag"

setup "meta: reset-failed appears in NO automatic path (only ctl recover-native)"
hits="$(grep -l 'reset-failed' \
  "$LIFECYCLE/paperos-enter" "$LIFECYCLE/paperos-exit" \
  "$LIFECYCLE/paperos-recover" "$LIFECYCLE/paperos-watch" \
  "$LIFECYCLE/paperos-lib.sh" 2>/dev/null)"
assert_eq "$hits" "" "reset-failed must not appear in enter/exit/recover/watch/lib"

# ══ Deploy / rollback packaging tests (Mac-side scripts via ssh/scp shims) ════
# These exercise the REAL deploy-lifecycle.sh / rollback-lifecycle.sh with ssh
# executing the remote block locally, scp copying locally, and a systemctl shim
# that owns link/disable/daemon-reload and reflects the linked unit's
# ExecStopPost back through `systemctl show` (the effective-unit gate).
PAPER_DEVICE="$(cd "$HERE/../.." && pwd)"

setup_deploy_env() { # test-name
  CURRENT="$1"
  DT="$(mktemp -d "${TMPDIR:-/tmp}/sys1-deploy.XXXXXX")"
  DTARGET="$DT/paperos"          # fake device /home/root/paperos
  DMOCK="$DT/mock"
  DSHIM="$DT/shim"
  mkdir -p "$DTARGET" "$DMOCK" "$DSHIM"
  touch "$DMOCK/xochitl-active"                    # native baseline
  echo "5.7.126" > "$DTARGET/compat.allowed"       # pre-seed so deploy skips /etc/os-release

  # ssh shim: run the remote command string locally (drop the host arg).
  cat > "$DSHIM/ssh" <<'EOSH'
#!/bin/sh
shift
exec sh -c "$*"
EOSH
  # scp shim: copy every source (all but the last arg) into the local dest dir.
  cat > "$DSHIM/scp" <<'EOSH'
#!/bin/sh
last=""; for a in "$@"; do last="$a"; done
dest="${last#*:}"
i=0; total=$#
for a in "$@"; do i=$((i+1)); [ "$i" -eq "$total" ] && break; cp "$a" "$dest"; done
EOSH
  # sleep shim: keep rollback fast/deterministic.
  printf '#!/bin/sh\nexit 0\n' > "$DSHIM/sleep"
  # ps shim: no PaperOS / watcher processes present.
  printf '#!/bin/sh\necho "  PID USER COMMAND"\nexit 0\n' > "$DSHIM/ps"

  cat > "$DSHIM/systemctl" <<'EOSH'
#!/bin/sh
S="$MOCK_DIR"
cmd="${1:-}"; unit="${2:-}"
echo "$cmd $unit" >> "$S/systemctl.calls"
xochitl_up() { [ -e "$S/xochitl-active" ] || echo x >> "$S/xochitl-starts"; touch "$S/xochitl-active"; }
case "$cmd" in
  is-active)
    case "$unit" in
      xochitl) [ -e "$S/xochitl-active" ] && { echo active; exit 0; }; echo inactive; exit 3 ;;
      rm-sync) { [ -e "$S/xochitl-active" ] && [ ! -e "$S/rmsync-fail" ]; } && { echo active; exit 0; }; echo inactive; exit 3 ;;
      paperos) [ -e "$S/paperos-running" ] && { echo active; exit 0; }; echo inactive; exit 3 ;;
    esac ;;
  start) [ "$unit" = xochitl ] && xochitl_up ;;
  stop)  [ "$unit" = paperos ] && rm -f "$S/paperos-running" ;;
  link)  echo "$unit" > "$S/linked-unit" ;;
  disable) [ "$unit" = paperos ] && rm -f "$S/linked-unit" ;;
  daemon-reload) : ;;
  show)
    case "$unit" in
      paperos|paperos.service)
        case "$*" in
          *ExecStopPost*)
            if [ -e "$S/force-stale-unit" ]; then
              echo "ExecStopPost={ path=/bin/sh ; argv[]=/bin/sh -c systemctl --no-block start xochitl ; ignore_errors=no }"
            elif [ -f "$S/linked-unit" ] && [ -f "$(cat "$S/linked-unit" 2>/dev/null)" ]; then
              esp=$(grep '^ExecStopPost=' "$(cat "$S/linked-unit")" 2>/dev/null | tail -1)
              echo "ExecStopPost={ path=/bin/sh ; argv[]=${esp#ExecStopPost=} ; ignore_errors=no }"
            fi ;;
          *LoadState*) echo loaded ;;
        esac ;;
    esac ;;
esac
exit 0
EOSH
  chmod 755 "$DSHIM/ssh" "$DSHIM/scp" "$DSHIM/sleep" "$DSHIM/ps" "$DSHIM/systemctl"
}
run_deploy() { # extra KEY=VAL...
  env PATH="$DSHIM:$PATH" MOCK_DIR="$DMOCK" PAPEROS_DEVICE=testdev \
    PAPEROS_HOME="$DTARGET" "$@" sh "$PAPER_DEVICE/deploy-lifecycle.sh"
}
run_rollback() { # [--purge]
  env PATH="$DSHIM:$PATH" MOCK_DIR="$DMOCK" PAPEROS_DEVICE=testdev \
    PAPEROS_HOME="$DTARGET" sh "$PAPER_DEVICE/rollback-lifecycle.sh" "$@"
}

setup_deploy_env "deploy: copies hardened unit into /home + links exact unit + daemon-reload"
run_deploy >/dev/null 2>&1; rc=$?
assert_eq "$rc" "0" "deploy exit 0"
assert_file "$DTARGET/systemd/paperos.service" "hardened unit shipped to /home"                       # (1)
assert_contains "$(cat "$DTARGET/systemd/paperos.service")" "restart-intent" "shipped unit is the hardened one"
assert_eq "$(cat "$DMOCK/linked-unit" 2>/dev/null)" "$DTARGET/systemd/paperos.service" "linked exact /home unit" # (2)
assert_contains "$(cat "$DMOCK/systemctl.calls")" "daemon-reload" "daemon-reload ran"                 # (3)

setup_deploy_env "deploy: verifies effective conditional ExecStopPost"
out="$(run_deploy 2>&1)"; rc=$?
assert_eq "$rc" "0" "deploy exit 0"
assert_contains "$out" "conditional restart-intent OK" "effective ExecStopPost verified"              # (4)

setup_deploy_env "deploy: stale/old effective unit blocks deployment (fail closed)"
touch "$DMOCK/force-stale-unit"
out="$(run_deploy 2>&1)"; rc=$?
assert_eq "$rc" "3" "deploy fails closed on stale effective unit"                                     # (5)
assert_contains "$out" "DEPLOY FAILED" "stale-unit fail-closed message"

setup_deploy_env "deploy: repeated deploy is idempotent"
run_deploy >/dev/null 2>&1
run_deploy >/dev/null 2>&1; rc=$?
assert_eq "$rc" "0" "second deploy exit 0"                                                            # (6)
assert_eq "$(cat "$DMOCK/linked-unit" 2>/dev/null)" "$DTARGET/systemd/paperos.service" "still linked to same unit"
assert_file "$DTARGET/systemd/paperos.service" "unit still present after repeat"

setup_deploy_env "deploy: enables nothing and does not stop xochitl"
run_deploy >/dev/null 2>&1
assert_eq "$(grep -c 'enable' "$DMOCK/systemctl.calls" 2>/dev/null)" "0" "no systemctl enable"        # (7)
assert_eq "$(grep -c 'stop xochitl' "$DMOCK/systemctl.calls" 2>/dev/null)" "0" "xochitl never stopped"  # (8)
assert_file "$DMOCK/xochitl-active" "xochitl still active after deploy"

setup_deploy_env "rollback: unlinks unit and restores native, preserving install"
run_deploy >/dev/null 2>&1
mkdir -p "$DTARGET/run"; touch "$DTARGET/run/state"
out="$(run_rollback 2>&1)"; rc=$?
assert_eq "$rc" "0" "rollback exit 0"
assert_contains "$out" "ROLLBACK OK" "native verified"                                                # (10)
assert_no_file "$DMOCK/linked-unit" "session unit unlinked"                                           # (9)
assert_contains "$(cat "$DMOCK/systemctl.calls")" "disable paperos" "disable called"
assert_no_file "$DTARGET/run" "volatile run/ removed"
assert_file "$DTARGET/systemd/paperos.service" "normal rollback preserves /home unit"                # (12)
assert_file "$DTARGET/bin/paperos-ctl" "normal rollback preserves bin/"

setup_deploy_env "rollback --purge: deletes /home unit + install files"
run_deploy >/dev/null 2>&1
out="$(run_rollback --purge 2>&1)"; rc=$?
assert_eq "$rc" "0" "purge rollback exit 0"
assert_no_file "$DTARGET/systemd/paperos.service" "purge removes /home unit"                          # (11)
assert_no_file "$DTARGET/bin" "purge removes bin/"
assert_no_file "$DTARGET/compat.allowed" "purge removes compat.allowed"

# ══ Summary ═══════════════════════════════════════════════════════════════════
echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ] || exit 1
exit 0
