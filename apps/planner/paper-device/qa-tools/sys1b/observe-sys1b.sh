#!/usr/bin/env bash
# PAPR.SYS.1b Launcher-Document discovery — Phase A 3-channel synchronized observer.
#
# QA-ONLY INSTRUMENTATION. Runs on the Mac; drives the device over one read-only
# SSH session per channel. NEVER deployed to the device, NEVER a systemd unit,
# NEVER a product artifact. See README.md.
#
# DESIGN (learned the hard way): all line formatting happens DEVICE-SIDE via plain
# `echo`; the Mac side only redirects each channel straight to a file. No local
# awk/sed in the live path — those block-buffer and swallow the early baseline
# lines. `-tt` is intentionally NOT used: it does not propagate kill to the remote
# loop (verified) and it corrupts the journal stream. Remote loops are stopped by
# unique-token kill in cleanup() plus a MAXSEC self-terminate backstop.
#
# Channels (all read-only, zero device footprint):
#   fd.log        ~60 ms poll of /proc/<xochitl-pid>/fd -> doc-store fd OPEN/CLOSE
#                 edges. The ONLY channel that can evidence an active open rather
#                 than a mere write side-effect. Emits formatted lines live.
#   snap-raw.log  1 Hz raw `find`+`stat` snapshots of the doc store. Diffed AFTER
#                 capture by snap-diff.sh (post-hoc = no buffering/loss risk).
#   journal.log   journalctl -fu xochitl (xochitl's own log).
#
# LIMITATIONS (do not overstate): a fast open/close between two fd samples can be
# missed — absence in fd.log is NOT proof a document was not opened. snap deltas
# are write side-effects, NOT proof of a user open. PAPR.SYS.1b.jrn passes only on the
# combined criterion in README.md §success-criterion.
#
# Usage:  ./observe-sys1b.sh              # start capture; Ctrl-C to stop
#         ./snap-diff.sh <capturedir>/snap-raw.log   # post-hoc snapshot deltas

set -uo pipefail

HOST="${PAPEROS_SSH_HOST:-remarkable-pro-move}"
TARGET_UUID="${SYS1B_TARGET_UUID:-6dc48b38-4709-4c41-8b49-77d5e0b1630a}"  # Quick sheets
FD_SLEEP_US="${SYS1B_FD_SLEEP_US:-50000}"   # ~60 ms effective after per-sample work
MAXSEC="${SYS1B_MAXSEC:-2400}"              # backstop: remote loops self-terminate
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTDIR="${SYS1B_OUTDIR:-$HOME/paperos-sys1b-capture}/$STAMP"
mkdir -p "$OUTDIR"

cleanup() {
  echo; echo "── stopping channels ──"
  # Kill remote loops by unique token (kills the loop shell = kills the loop),
  # then a generic backstop, then report a self-match-proof clean check.
  ssh -o ConnectTimeout=8 "$HOST" '
    # Multiple passes: a child (e.g. journalctl) reparented after its token-shell
    # dies is only caught on a later pass.
    for pass in 1 2 3; do
      for tok in SYS1B_OBS_FD SYS1B_OBS_SNAP SYS1B_OBS_JRN; do
        for p in $(ps w | grep "$tok" | grep -v grep | awk "{print \$1}"); do kill "$p" 2>/dev/null; done
      done
      for p in $(ps w | grep -E "[u]sleep [0-9]|[s]tat -c %Y|[j]ournalctl -fu xochitl|[f]ind .*remarkable/xochitl" | awk "{print \$1}"); do kill "$p" 2>/dev/null; done
      sleep 1
    done
    left=$(ps w | grep -E "SYS1B|usleep|journalctl|find .*remarkable" | grep -v grep | wc -l)
    printf "END-STATE xochitl=%s rm-sync=%s paperos=%s observer-procs=%s\n" \
      "$(systemctl is-active xochitl)" "$(systemctl is-active rm-sync)" \
      "$(ps w | grep -c "[p]aperos")" "$left"
  ' 2>&1 | tee -a "$OUTDIR/end-state.log"
  # Local ssh channels.
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
  echo "capture: $OUTDIR"
}
trap cleanup INT TERM EXIT

echo "PAPR.SYS.1b 3-channel observer  host=$HOST  target=$TARGET_UUID (Quick sheets)"
echo "capture dir: $OUTDIR"
ssh -o ConnectTimeout=8 "$HOST" '
  printf "baseline xochitl=%s rm-sync=%s xochitl-pid=%s doc-fds-open=%s\n" \
    "$(systemctl is-active xochitl)" "$(systemctl is-active rm-sync)" "$(pidof xochitl)" \
    "$(ls -l /proc/$(pidof xochitl)/fd/ 2>/dev/null | grep -c "share/remarkable/xochitl")"' \
  | tee "$OUTDIR/baseline.log" \
  || { echo "device unreachable — press power, then: ping 10.11.99.1"; exit 1; }

pids=()

# ── fd.log : /proc/<pid>/fd edge observer (formatted device-side) ─────────────
ssh -o ConnectTimeout=8 "$HOST" '
  : SYS1B_OBS_FD
  UUID='"$TARGET_UUID"'; US='"$FD_SLEEP_US"'
  read s0 _ < /proc/uptime; dl=$(( ${s0%.*} + '"$MAXSEC"' ))
  rp(){ PID=$(pidof xochitl | tr " " "\n" | sed -n "1p"); }
  rp; prev="__init__"
  while :; do
    read up _ < /proc/uptime
    [ "${up%.*}" -ge "$dl" ] && { echo "$(date +%H:%M:%S) $up FD deadline; exit"; break; }
    [ -d "/proc/$PID" ] || rp
    cur=$(ls -l "/proc/$PID/fd/" 2>/dev/null | grep "share/remarkable/xochitl" | awk "{print \$NF}" | sort | tr "\n" " ")
    if [ "$cur" != "$prev" ]; then
      w=$(date +%H:%M:%S)
      if [ "$prev" = "__init__" ]; then echo "$w $up FD baseline: ${cur:-<none>}"
      elif [ -n "$cur" ]; then
        echo "$cur" | grep -q "$UUID" && tag=TARGET || tag=other
        echo "$w $up FD OPEN[$tag]: $cur"
      else echo "$w $up FD CLOSE: <none>"; fi
      prev="$cur"
    fi
    usleep "$US"
  done
' > "$OUTDIR/fd.log" 2>&1 &
pids+=($!)

# ── snap-raw.log : 1 Hz raw doc-store snapshots (diffed post-hoc) ─────────────
ssh -o ConnectTimeout=8 "$HOST" '
  : SYS1B_OBS_SNAP
  XDIR="$HOME/.local/share/remarkable/xochitl"
  read s0 _ < /proc/uptime; dl=$(( ${s0%.*} + '"$MAXSEC"' ))
  while :; do
    read up _ < /proc/uptime
    [ "${up%.*}" -ge "$dl" ] && break
    echo "@SNAP $(date +%H:%M:%S) $up"
    find "$XDIR" -type f 2>/dev/null | sort | while read -r f; do stat -c "%Y %s %n" "$f"; done
    sleep 1
  done
' > "$OUTDIR/snap-raw.log" 2>&1 &
pids+=($!)

# ── journal.log : xochitl journal ─────────────────────────────────────────────
ssh -o ConnectTimeout=8 "$HOST" ': SYS1B_OBS_JRN; exec journalctl -fu xochitl --no-pager -o short-iso' \
  > "$OUTDIR/journal.log" 2>&1 &
pids+=($!)

echo "── streaming (Ctrl-C to stop). Narrate each matrix step; live fd + journal below ──"
# Live view: fd edges + journal only (snap-raw is intentionally noisy → file only).
# tail runs in BACKGROUND and the script blocks on `wait`; a SIGINT delivered to
# this shell then interrupts `wait` and fires the cleanup trap immediately (a
# foreground `tail -f` would defer the trap until tail exits, orphaning loops).
tail -n +1 -f "$OUTDIR/fd.log" "$OUTDIR/journal.log" &
pids+=($!)
wait
