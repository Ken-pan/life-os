#!/usr/bin/env bash
# Idempotent hard-stop for observe-sys1b.sh. Safe to run any number of times.
# Kills all PAPR.SYS.1b observer processes locally and on the device, then prints a
# self-match-proof clean check. Use this instead of relying on Ctrl-C if in doubt
# (remote loops also self-terminate at SYS1B_MAXSEC regardless).
set -uo pipefail
HOST="${PAPEROS_SSH_HOST:-remarkable-pro-move}"

# Local: orchestrator + its tail.
pkill -f "observe-sys1b" 2>/dev/null || true
pkill -f "tail.*paperos-sys1b-capture" 2>/dev/null || true
pkill -f "tail.*sys1b" 2>/dev/null || true

# Device: token kill + generic backstop, multiple passes (reparented children).
ssh -o ConnectTimeout=8 "$HOST" '
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
'
