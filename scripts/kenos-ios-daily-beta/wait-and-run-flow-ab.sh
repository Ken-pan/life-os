#!/usr/bin/env bash
# Wait for Ken’s 17 Pro to become CoreDevice-available, then run FLOW A/B harness.
# Usage: ./scripts/kenos-ios-daily-beta/wait-and-run-flow-ab.sh [max_minutes]
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
MAX_MIN="${1:-120}"
EVID="$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21"
LOG="$EVID/logs/wait-and-run-flow-ab.txt"
PIDFILE="/tmp/kenos-wait-flow-ab.pid"
mkdir -p "$EVID/logs"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

echo $$ >"$PIDFILE"
echo "$(ts) wait start max_min=$MAX_MIN device=$DEVICE pid=$$" | tee -a "$LOG"

end=$(( $(date +%s) + MAX_MIN * 60 ))
poll=0
while (( $(date +%s) < end )); do
  poll=$((poll + 1))
  st="$(xcrun devicectl list devices 2>/dev/null | grep -F "17 Pro" || true)"
  # Heartbeat every poll (keeps evidence fresh if process dies mid-wait)
  echo "$(ts) poll=$poll state=$(echo "$st" | awk '{print $(NF-3),$(NF-2),$(NF-1),$NF}' 2>/dev/null || echo unknown)" | tee -a "$LOG"
  if [[ -n "$st" ]]; then
    echo "$(ts) $st" >>"$LOG"
  fi

  if echo "$st" | grep -Eq "available \(paired\)|connected"; then
    LAN="$(ipconfig getifaddr en0 || true)"
    if [[ -z "$LAN" ]]; then
      echo "$(ts) no en0 LAN yet" | tee -a "$LOG"
      sleep 5
      continue
    fi
    set +e
    xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
      --payload-url "http://${LAN}:5219/?iosNativeShell=1" \
      space.kenos.app.ios >>"$LOG" 2>&1
    ec=$?
    set -e
    if [[ $ec -eq 0 ]] && ! grep -q Locked "$LOG"; then
      echo "$(ts) UNLOCKED — running ios-flow-ab-device.mjs" | tee -a "$LOG"
      cd "$ROOT"
      set +e
      KENOS_IOS_DEVICE="$DEVICE" node scripts/kenos-ios-daily-beta/ios-flow-ab-device.mjs 2>&1 | tee -a "$LOG"
      harness_ec=${PIPESTATUS[0]}
      set -e
      echo "$(ts) FLOW harness exit=$harness_ec" | tee -a "$LOG"
      rm -f "$PIDFILE"
      exit "$harness_ec"
    fi
    echo "$(ts) device listed but launch failed/locked ec=$ec" | tee -a "$LOG"
  fi
  sleep 15
done

echo "$(ts) TIMEOUT — 17 Pro still unavailable after ${MAX_MIN}m" | tee -a "$LOG"
rm -f "$PIDFILE"
exit 1
