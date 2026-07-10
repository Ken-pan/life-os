#!/bin/bash
set -e

DURATION_SEC="${1:-30}"
REMOTE_LOG="/tmp/paperos-ink-probe-metrics.jsonl"
LOCAL_LOG_DIR="logs"
mkdir -p "$LOCAL_LOG_DIR"

# Copy the binary to the device
PROBE_BIN="build-docker/paperos-ink-probe"
if [ ! -f "$PROBE_BIN" ]; then
    echo "Probe binary not found. Please build it first."
    exit 1
fi

echo "Copying probe to device..."
scp "$PROBE_BIN" remarkable-pro-move:/tmp/paperos-ink-probe

echo "Executing gold baseline probe on device (this will stop xochitl and paperos)..."
ssh remarkable-pro-move "DURATION_SEC='$DURATION_SEC' REMOTE_LOG='$REMOTE_LOG' sh -s" << 'REMOTE_SCRIPT'
    cleanup() {
        echo "[Wrapper] Restoring xochitl..."
        systemctl start xochitl
        echo "[Wrapper] Clean exit."
    }
    trap cleanup EXIT INT TERM HUP

    echo "[Wrapper] Stopping xochitl..."
    systemctl stop xochitl || true
    
    echo "[Wrapper] Killing paperos if running..."
    killall paperos || true
    sleep 2

    # Remove lockfiles
    rm -f /tmp/epframebuffer.lock
    rm -f /tmp/epd.lock
    rm -f "$REMOTE_LOG"

    echo "[Wrapper] Running probe: QCore + raw marker + Mono/mode0 + 8ms scheduler..."
    chmod +x /tmp/paperos-ink-probe
    /tmp/paperos-ink-probe \
      --flush-ms 8 \
      --duration-sec "$DURATION_SEC" \
      --content-type 0 \
      --screen-mode 0

    # trap will automatically restart xochitl
REMOTE_SCRIPT

STAMP="$(date +%Y%m%d-%H%M%S)"
scp "remarkable-pro-move:$REMOTE_LOG" "$LOCAL_LOG_DIR/paperos-ink-probe-$STAMP.jsonl" || true
echo "Done. Metrics: $LOCAL_LOG_DIR/paperos-ink-probe-$STAMP.jsonl"
