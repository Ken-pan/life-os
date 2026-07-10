#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE="${PAPEROS_DEVICE_HOST:-remarkable-pro-move}"
DURATION_SEC="${1:-60}"
BIN="build-docker/paperos-ink-probe"
REMOTE_BIN="/tmp/paperos-ink-probe"
REMOTE_SCRIPT="/tmp/paperos-device-run.sh"
REMOTE_METRICS="/tmp/paperos-ink-probe-metrics.jsonl"
REMOTE_STDOUT="/tmp/paperos-ink-probe-device.log"
LOG_DIR="logs"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -x "$BIN" ]; then
  echo "Missing executable $BIN; run scripts/build-gold.sh first." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

echo "[deploy] verifying SSH"
ssh "$DEVICE" 'echo ok; uname -a'

LOCAL_SHA="$(shasum -a 256 "$BIN" | awk '{print $1}')"
echo "[deploy] local sha256=$LOCAL_SHA"

scp "$BIN" "$DEVICE:$REMOTE_BIN"
scp "scripts/device-run.sh" "$DEVICE:$REMOTE_SCRIPT"
ssh "$DEVICE" "chmod +x '$REMOTE_BIN' '$REMOTE_SCRIPT'"

REMOTE_SHA="$(ssh "$DEVICE" "sha256sum '$REMOTE_BIN' | cut -d ' ' -f1")"
echo "[deploy] remote sha256=$REMOTE_SHA"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "SHA mismatch after upload" >&2
  exit 1
fi

echo "[deploy] starting device test for ${DURATION_SEC}s"
ssh "$DEVICE" "PROBE_BIN='$REMOTE_BIN' METRICS_LOG='$REMOTE_METRICS' DEVICE_STDOUT='$REMOTE_STDOUT' '$REMOTE_SCRIPT' '$DURATION_SEC'"

scp "$DEVICE:$REMOTE_METRICS" "$LOG_DIR/paperos-ink-probe-metrics-$STAMP.jsonl"
scp "$DEVICE:$REMOTE_STDOUT" "$LOG_DIR/paperos-ink-probe-device-$STAMP.log"

XSTATUS="$(ssh "$DEVICE" 'systemctl is-active xochitl || true')"
echo "[deploy] xochitl=$XSTATUS"
if [ "$XSTATUS" != "active" ]; then
  echo "xochitl did not recover to active" >&2
  exit 1
fi
PAPEROS_LEFT="$(ssh "$DEVICE" "ps | grep -E 'paperos(\\.[a-z0-9]+)? -platform|/paperos(\\.[a-z0-9]+)?( |$)|\\./paperos(\\.[a-z0-9]+)?( |$)' | grep -v grep || true")"
if [ -n "$PAPEROS_LEFT" ]; then
  echo "paperos process still running after test:" >&2
  echo "$PAPEROS_LEFT" >&2
  exit 1
fi

echo "[deploy] metrics=$LOG_DIR/paperos-ink-probe-metrics-$STAMP.jsonl"
echo "[deploy] device_log=$LOG_DIR/paperos-ink-probe-device-$STAMP.log"
