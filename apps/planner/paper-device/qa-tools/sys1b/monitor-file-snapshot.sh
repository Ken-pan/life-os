#!/usr/bin/env bash
# PAPR.SYS.1b.fs Launcher-Document discovery monitor (read-only, zero device footprint).
#
# WHY THIS EXISTS: the device has no inotifywait/inotifyd/strace/fatrace/lsof, and
# /home is mounted relatime (atime does not bump on repeated opens). So the
# discovery doc's Terminal-A `inotifywait -m` monitor cannot run on this hardware.
# This harness substitutes a 1 Hz poll-snapshot of the whole xochitl store and
# prints file-event deltas (NEW / MOD / DEL) live, aligned to wall-clock so Ken
# can call out each physical-operation window (T-02 .. T-08).
#
# CAPTURES: writes / new files / deletions / size+mtime changes (thumbnails,
#   .metadata lastOpened, .content, sync-created files).
# DOES NOT CAPTURE: a pure read/open that writes nothing (unavoidable without an
#   inotify/fanotify binary staged on device — see §escalation in handoff).
#
# Guarantees: only `find` + `stat` on the device. No writes, no install, no
# systemd, no EVIOCGRAB. One SSH session; Ctrl-C to stop.

set -euo pipefail

HOST="${PAPEROS_SSH_HOST:-remarkable-pro-move}"
TARGET_UUID="${SYS1B_TARGET_UUID:-6dc48b38-4709-4c41-8b49-77d5e0b1630a}"  # Quick sheets
OUTDIR="${SYS1B_OUTDIR:-$HOME/paperos-sys1b-capture}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RAW="$OUTDIR/sys1b-raw-$STAMP.log"
EVENTS="$OUTDIR/sys1b-events-$STAMP.log"

mkdir -p "$OUTDIR"

echo "PAPR.SYS.1b.fs monitor  host=$HOST  target=$TARGET_UUID (Quick sheets)"
echo "raw snapshots : $RAW"
echo "event stream  : $EVENTS"
echo

# Baseline + reachability (read-only).
ssh -o ConnectTimeout=5 "$HOST" '
  printf "baseline  xochitl=%s rm-sync=%s  paperos_procs=%s\n" \
    "$(systemctl is-active xochitl)" "$(systemctl is-active rm-sync)" \
    "$(ps w | grep -c "[p]aperos")"
' || { echo "device unreachable — press power button, then: ping 10.11.99.1"; exit 1; }

echo
echo "Legend:  * = target UUID (Quick sheets)   T = thumbnail   M = metadata"
echo "Streaming file deltas at 1 Hz. Call out each op window; Ctrl-C to stop."
echo "----------------------------------------------------------------------"

# One read-only SSH session emits a snapshot block each second; awk diffs
# consecutive snapshots locally and prints NEW/MOD/DEL with the snapshot clock.
ssh -o ConnectTimeout=5 "$HOST" '
  XDIR="$HOME/.local/share/remarkable/xochitl"
  while true; do
    echo "@SNAP $(date +%H:%M:%S)"
    find "$XDIR" -type f 2>/dev/null | sort | while read -r f; do
      stat -c "%Y %s %n" "$f"
    done
    sleep 1
  done
' | tee "$RAW" | awk -v target="$TARGET_UUID" '
  function tag(p,   t) {
    t = "  "
    if (index(p, target)) t = substr(t,1,1) "*"
    if (index(p, ".thumbnails")) t = t "T"
    else if (p ~ /\.metadata$/) t = t "M"
    return t
  }
  function base(p) { n=split(p,a,"/"); return a[n] }
  /^@SNAP/ {
    if (primed) {
      for (p in cur) {
        if (!(p in prev))              printf "%s  NEW %s  %s\n", clk, tag(p), base(p)
        else if (cur[p] != prev[p]) {
          split(prev[p], o, " "); split(cur[p], c, " ")
          printf "%s  MOD %s  %s  size %s->%s\n", clk, tag(p), base(p), o[2], c[2]
        }
      }
      for (p in prev) if (!(p in cur)) printf "%s  DEL %s  %s\n", clk, tag(p), base(p)
    }
    n=0; for (p in prev) delete prev[p]
    for (p in cur) { prev[p]=cur[p]; delete cur[p]; n++ }
    if (n > 0 && seen) primed=1   # start diffing only after one full baseline snapshot
    seen=1; clk=$2; next
  }
  { mt=$1; sz=$2; $1=""; $2=""; sub(/^  /,""); cur[$0]=mt" "sz }
' | tee "$EVENTS"
