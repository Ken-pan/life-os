#!/bin/sh
set -eu

DURATION_SEC="${1:-60}"
PROBE_BIN="${PROBE_BIN:-/tmp/paperos-ink-probe}"
METRICS_LOG="${METRICS_LOG:-/tmp/paperos-ink-probe-metrics.jsonl}"
DEVICE_STDOUT="${DEVICE_STDOUT:-/tmp/paperos-ink-probe-device.log}"

cleanup() {
  status=$?
  echo "[device-run] restoring xochitl" | tee -a "$DEVICE_STDOUT"
  systemctl start xochitl >/dev/null 2>&1 || true
  systemctl is-active xochitl | tee -a "$DEVICE_STDOUT" || true
  exit "$status"
}

paperos_pids() {
  ps | awk '/paperos(\.[a-z0-9]+)? -platform|\/paperos(\.[a-z0-9]+)?( |$)|\.\/paperos(\.[a-z0-9]+)?( |$)/ && !/awk/ { print $1 }'
}

trap cleanup EXIT INT TERM HUP

: > "$DEVICE_STDOUT"
rm -f "$METRICS_LOG"

echo "[device-run] stopping paperos/xochitl" | tee -a "$DEVICE_STDOUT"
systemctl stop paperos >/dev/null 2>&1 || true
for pid in $(paperos_pids); do
  kill "$pid" >/dev/null 2>&1 || true
done
sleep 1
for pid in $(paperos_pids); do
  kill -9 "$pid" >/dev/null 2>&1 || true
done
systemctl stop xochitl >/dev/null 2>&1 || true
sleep 1
echo "[device-run] paperos_pids_after_stop=$(paperos_pids | tr '\n' ' ')" | tee -a "$DEVICE_STDOUT"
echo "[device-run] xochitl_after_stop=$(systemctl is-active xochitl || true)" | tee -a "$DEVICE_STDOUT"

echo "[device-run] acquiring framebuffer" | tee -a "$DEVICE_STDOUT"
rm -f /tmp/epframebuffer.lock /tmp/epd.lock

chmod +x "$PROBE_BIN"
echo "[device-run] running gold baseline for ${DURATION_SEC}s" | tee -a "$DEVICE_STDOUT"
"$PROBE_BIN" \
  --flush-ms 8 \
  --duration-sec "$DURATION_SEC" \
  --content-type 0 \
  --screen-mode 0 \
  --device /dev/input/event2 2>&1 | tee -a "$DEVICE_STDOUT"
