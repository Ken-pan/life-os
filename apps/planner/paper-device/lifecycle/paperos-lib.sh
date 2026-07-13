#!/bin/sh
# PAPR.SYS.1 shared runtime library. POSIX sh, BusyBox v1.36 compatible.
#
# Device constraints (verified 2026-07-11 discovery): no pkill, no inotify
# tools, no `date +%N`, /home persistent, /etc volatile overlay, rm-sync is
# BindsTo/PartOf xochitl so native recovery must verify BOTH units.
#
# All mutable state lives under $PAPEROS_HOME/run (persistent /home). Every
# path and timeout is env-overridable so the host test harness can exercise
# the real scripts against mocked systemctl/ps/kill.

PAPEROS_HOME="${PAPEROS_HOME:-/home/root/paperos}"
PAPEROS_BIN="${PAPEROS_BIN:-$PAPEROS_HOME/paperos}"
RUN_DIR="$PAPEROS_HOME/run"
LOG_FILE="$RUN_DIR/lifecycle.log"
LOG_MAX_BYTES="${PAPEROS_LOG_MAX_BYTES:-262144}"
STATE_FILE="$RUN_DIR/state"

# Markers. DISABLED is owner-facing (top level, survives rollback of run/);
# crashloop + watcher.exhausted are runtime fail-closed latches.
DISABLE_MARKER="$PAPEROS_HOME/DISABLED"
CRASHLOOP_MARKER="$RUN_DIR/crashloop"
WATCH_EXHAUSTED_MARKER="$RUN_DIR/watcher.exhausted"

COMPAT_FILE="${PAPEROS_COMPAT_FILE:-$PAPEROS_HOME/compat.allowed}"
LAUNCHER_UUID_FILE="${PAPEROS_LAUNCHER_UUID_FILE:-$PAPEROS_HOME/launcher.uuid}"
OS_RELEASE="${PAPEROS_OS_RELEASE:-/etc/os-release}"
XOCHITL_STORE="${PAPEROS_XOCHITL_STORE:-/home/root/.local/share/remarkable/xochitl}"

READY_TIMEOUT="${PAPEROS_READY_TIMEOUT:-20}"
STABLE_SECS="${PAPEROS_STABLE_SECS:-3}"
NATIVE_TIMEOUT="${PAPEROS_NATIVE_TIMEOUT:-30}"
STOP_TIMEOUT="${PAPEROS_STOP_TIMEOUT:-20}"
KILL_GRACE="${PAPEROS_KILL_GRACE:-1}"

# SYS.1 hardening (Finding C). Every controlled xochitl restore (paperos-exit's
# ExecStopPost, recover_to_native, a failed-enter recovery) is a xochitl START;
# the vendor rate-limits those to StartLimitBurst=4 / 10 min and force-reboots
# on overrun. We stay well under it: at most XOCHITL_CYCLE_MAX restores per
# XOCHITL_CYCLE_WINDOW seconds, and >= MIN_SWITCH_INTERVAL seconds between full
# switches. The budget is checked BEFORE xochitl is stopped, so we never enter
# PaperOS without a safe exit budget in hand.
XOCHITL_RESTORE_LEDGER="$RUN_DIR/xochitl-restores"
XOCHITL_CYCLE_WINDOW="${PAPEROS_XOCHITL_CYCLE_WINDOW:-600}"
XOCHITL_CYCLE_MAX="${PAPEROS_XOCHITL_CYCLE_MAX:-2}"
MIN_SWITCH_INTERVAL="${PAPEROS_MIN_SWITCH_INTERVAL:-180}"

# PaperOS-only restart marker (Layer 1). While a FRESH marker exists the unit's
# ExecStopPost skips the xochitl restore, so a restart does not bounce xochitl.
# TTL-bounded: an absent OR stale marker always restores xochitl (fail-safe —
# the ExecStopPost check in paperos.service uses the same TTL, hardcoded there).
RESTART_INTENT_MARKER="$RUN_DIR/restart-intent"
RESTART_INTENT_TTL="${PAPEROS_RESTART_INTENT_TTL:-30}"

# States: NATIVE ENTERING_PAPEROS PAPEROS_ACTIVE EXITING_PAPEROS RECOVERY
#         DISABLED INCOMPATIBLE (UNKNOWN when no state file yet).

ensure_run_dir() { mkdir -p "$RUN_DIR"; }

now_epoch() { date +%s; }
now_iso() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

get_state() {
  if [ -r "$STATE_FILE" ]; then
    _st=$(awk 'NR==1{print $1}' "$STATE_FILE" 2>/dev/null)
    if [ -n "$_st" ]; then
      echo "$_st"
      return 0
    fi
  fi
  echo UNKNOWN
}

set_state() {
  ensure_run_dir
  echo "$1 $(now_iso)" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

# Structured single-line log. Never log token/credential values.
log_line() {
  _comp="$1"; _event="$2"; shift 2
  ensure_run_dir
  if [ -f "$LOG_FILE" ]; then
    _sz=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$_sz" -gt "$LOG_MAX_BYTES" ] 2>/dev/null; then
      mv "$LOG_FILE" "$LOG_FILE.1" 2>/dev/null || true
    fi
  fi
  echo "ts=$(now_iso) comp=$_comp state=$(get_state) event=$_event $*" >> "$LOG_FILE"
}

# mkdir-based lock (atomic on BusyBox). Stale locks (dead owner pid) are
# stolen; live owners block. kill -0 is portable liveness (no /proc on host).
acquire_lock() {
  _lockdir="$RUN_DIR/lock.$1"
  ensure_run_dir
  if mkdir "$_lockdir" 2>/dev/null; then
    echo $$ > "$_lockdir/pid"
    return 0
  fi
  _owner=$(cat "$_lockdir/pid" 2>/dev/null)
  if [ -n "$_owner" ] && kill -0 "$_owner" 2>/dev/null; then
    return 1
  fi
  rm -rf "$_lockdir"
  mkdir "$_lockdir" 2>/dev/null || return 1
  echo $$ > "$_lockdir/pid"
  return 0
}

release_lock() { rm -rf "$RUN_DIR/lock.$1"; }

is_disabled() { [ -e "$DISABLE_MARKER" ]; }
is_crashlooped() { [ -e "$CRASHLOOP_MARKER" ]; }

# OTA compatibility: fail closed when os-release or the allowlist is missing,
# unreadable, or the current VERSION_ID is not explicitly accepted.
compat_ok() {
  [ -r "$COMPAT_FILE" ] || return 1
  [ -r "$OS_RELEASE" ] || return 1
  _vid=$(sed -n 's/^VERSION_ID=//p' "$OS_RELEASE" | tr -d '"' | head -n 1)
  [ -n "$_vid" ] || return 1
  grep -qx "$_vid" "$COMPAT_FILE"
}

current_version_id() {
  sed -n 's/^VERSION_ID=//p' "$OS_RELEASE" 2>/dev/null | tr -d '"' | head -n 1
}

unit_active() { [ "$(systemctl is-active "$1" 2>/dev/null)" = "active" ]; }

native_ok() { unit_active xochitl && unit_active rm-sync; }

wait_native() {
  _deadline=$(( $(now_epoch) + NATIVE_TIMEOUT ))
  while :; do
    if native_ok; then return 0; fi
    if [ "$(now_epoch)" -ge "$_deadline" ]; then return 1; fi
    sleep 1
  done
}

# ── xochitl-cycle budget (Finding C) ────────────────────────────────────────
# Ledger of controlled xochitl restore timestamps (epoch, one per line), pruned
# to the window on every write so it stays tiny.
record_xochitl_restore() {
  ensure_run_dir
  _now=$(now_epoch)
  _cut=$(( _now - XOCHITL_CYCLE_WINDOW ))
  if [ -f "$XOCHITL_RESTORE_LEDGER" ]; then
    awk -v c="$_cut" '$1 ~ /^[0-9]+$/ && $1 >= c' "$XOCHITL_RESTORE_LEDGER" \
      > "$XOCHITL_RESTORE_LEDGER.tmp" 2>/dev/null \
      && mv "$XOCHITL_RESTORE_LEDGER.tmp" "$XOCHITL_RESTORE_LEDGER"
  fi
  echo "$_now" >> "$XOCHITL_RESTORE_LEDGER"
}

count_recent_restores() {
  if [ ! -f "$XOCHITL_RESTORE_LEDGER" ]; then echo 0; return; fi
  _cut=$(( $(now_epoch) - XOCHITL_CYCLE_WINDOW ))
  awk -v c="$_cut" '$1 ~ /^[0-9]+$/ && $1 >= c {n++} END {print n+0}' \
    "$XOCHITL_RESTORE_LEDGER"
}

last_restore_epoch() {
  _l=$(tail -n 1 "$XOCHITL_RESTORE_LEDGER" 2>/dev/null)
  case "$_l" in ''|*[!0-9]*) echo 0 ;; *) echo "$_l" ;; esac
}

# 0 = entering PaperOS now stays within the xochitl restart budget; 1 = over
# budget (caller must BLOCK and leave xochitl running untouched). Sets
# CYCLE_BLOCK_REASON for logging.
CYCLE_BLOCK_REASON=""
xochitl_cycle_ok() {
  CYCLE_BLOCK_REASON=""
  _n=$(count_recent_restores)
  if [ "$_n" -ge "$XOCHITL_CYCLE_MAX" ]; then
    CYCLE_BLOCK_REASON="restores=$_n/$XOCHITL_CYCLE_MAX per ${XOCHITL_CYCLE_WINDOW}s"
    return 1
  fi
  _last=$(last_restore_epoch)
  if [ "$_last" -gt 0 ]; then
    _delta=$(( $(now_epoch) - _last ))
    if [ "$_delta" -lt "$MIN_SWITCH_INTERVAL" ]; then
      CYCLE_BLOCK_REASON="last-switch ${_delta}s < ${MIN_SWITCH_INTERVAL}s"
      return 1
    fi
  fi
  return 0
}

# Vendor StartLimit / OnFailure compatibility. Our budget only holds if the OS
# still ships the rate limit we characterized (Finding C). Fail closed when the
# properties are unreadable/unparseable, the vendor burst is not strictly larger
# than our per-window budget (i.e. the OS is at least as strict as us), or the
# emergency handler drifted away from emergency.target. Skippable for host tests
# / device debugging via PAPEROS_SKIP_STARTLIMIT_CHECK=1.
STARTLIMIT_BLOCK_REASON=""
vendor_startlimit_ok() {
  STARTLIMIT_BLOCK_REASON=""
  [ "${PAPEROS_SKIP_STARTLIMIT_CHECK:-0}" = 1 ] && return 0
  _props=$(systemctl show xochitl.service \
    -p StartLimitBurst -p StartLimitIntervalUSec -p StartLimitAction \
    -p OnFailure 2>/dev/null)
  if [ -z "$_props" ]; then
    STARTLIMIT_BLOCK_REASON="unreadable"
    return 1
  fi
  _burst=$(printf '%s\n' "$_props" | sed -n 's/^StartLimitBurst=//p' | head -n 1)
  _onfail=$(printf '%s\n' "$_props" | sed -n 's/^OnFailure=//p' | head -n 1)
  case "$_burst" in
    ''|*[!0-9]*) STARTLIMIT_BLOCK_REASON="burst-unparseable"; return 1 ;;
  esac
  if [ "$_burst" -le "$XOCHITL_CYCLE_MAX" ]; then
    STARTLIMIT_BLOCK_REASON="vendor-burst=$_burst <= budget=$XOCHITL_CYCLE_MAX"
    return 1
  fi
  case "$_onfail" in
    *emergency.target*) : ;;
    *) STARTLIMIT_BLOCK_REASON="onfailure-drift"; return 1 ;;
  esac
  return 0
}

# ── PaperOS-only restart intent (Layer 1) ───────────────────────────────────
restart_intent_set() { ensure_run_dir; now_epoch > "$RESTART_INTENT_MARKER"; }
restart_intent_clear() { rm -f "$RESTART_INTENT_MARKER"; }
# Fresh iff the marker exists AND its epoch is within TTL. Any absence or parse
# failure returns 1 (not active) so the fallback always restores xochitl.
restart_intent_active() {
  [ -f "$RESTART_INTENT_MARKER" ] || return 1
  _ts=$(cat "$RESTART_INTENT_MARKER" 2>/dev/null)
  case "$_ts" in ''|*[!0-9]*) return 1 ;; esac
  _age=$(( $(now_epoch) - _ts ))
  [ "$_age" -ge 0 ] && [ "$_age" -le "$RESTART_INTENT_TTL" ]
}

# Match ONLY the actual PaperOS app process: the managed binary / .next
# candidate launched with `-platform` (both open-paperos.sh and paperos.service
# always pass `-platform epaper`), plus ink test candidates. The lifecycle
# helper scripts (paperos-watch/ctl/enter/exit/recover/lib) and our own ps/awk
# are explicitly skipped — otherwise a `ps w` line truncated at terminal width
# to end in `/paperos`, or a helper's own path, would false-match and could fool
# the native-recovery verification. No pkill on device; PAPEROS_KILL lets tests
# intercept.
paperos_pids() {
  ps w 2>/dev/null | awk '
    /awk/ { next }
    /paperos-(watch|ctl|enter|exit|recover|lib)/ { next }
    /paperos(\.[a-z0-9]+)? -platform/ { print $1; next }
    /paperos-ink-[a-z0-9-]+/ { print $1 }
  '
}

_send_signal() { ${PAPEROS_KILL:-kill} "$@" 2>/dev/null || true; }

kill_paperos_procs() {
  _found=0
  for _p in $(paperos_pids); do _found=1; _send_signal "$_p"; done
  [ "$_found" = 1 ] || return 0
  sleep "$KILL_GRACE"
  for _p in $(paperos_pids); do _send_signal -9 "$_p"; done
}

paperos_ready() { unit_active paperos && [ -n "$(paperos_pids)" ]; }

# Restore native shell after any failure. Verifies xochitl AND rm-sync active
# and zero PaperOS processes before declaring NATIVE. Never touches boot
# config; safe to call repeatedly.
recover_to_native() {
  _reason="${1:-unspecified}"
  set_state RECOVERY
  # A recovery must never honour a leftover restart-intent — xochitl has to come
  # back here regardless of any pending PaperOS-only restart.
  restart_intent_clear
  log_line recover begin reason="$_reason"
  systemctl stop paperos >/dev/null 2>&1 || true
  kill_paperos_procs
  rm -f /tmp/paperos-test-driver/*.lock 2>/dev/null || true
  systemctl start xochitl >/dev/null 2>&1 || true
  if wait_native && [ -z "$(paperos_pids)" ]; then
    record_xochitl_restore
    set_state NATIVE
    log_line recover done reason="$_reason" result=native-verified
    return 0
  fi
  log_line recover failed reason="$_reason" \
    xochitl="$(systemctl is-active xochitl 2>/dev/null)" \
    rmsync="$(systemctl is-active rm-sync 2>/dev/null)" \
    paperos_procs="$(paperos_pids | wc -l | tr -d ' ')"
  return 1
}
