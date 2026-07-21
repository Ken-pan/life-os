#!/usr/bin/env bash
# Capture 10 UIUX shots × 3 platforms (Kenos / Plan / Training) on device.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

DEVICE="${DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
BUNDLE="${BUNDLE:-space.kenos.app.ios}"
LAN="$(ipconfig getifaddr en0 || ipconfig getifaddr en1)"
PYMD="${PYMD:-/tmp/kenos-ios-shot-venv/bin/pymobiledevice3}"
ROOT="/Users/kenpan/「Projects」/life-os/docs/qa/evidence/kenos-ios-dogfood-2026-07/screenshots/uiux-30"

shot() {
  local out="$1"
  "$PYMD" developer dvt screenshot --userspace "$out" >/dev/null 2>&1
  echo "  shot $(basename "$out")"
}

launch_http() {
  local url="$1"
  xcrun devicectl device process launch --terminate-existing --device "$DEVICE" \
    --payload-url "$url" "$BUNDLE" >/dev/null 2>&1 || true
}

launch_kenos() {
  local url="$1"
  xcrun devicectl device process launch --terminate-existing --device "$DEVICE" \
    --payload-url "$url" "$BUNDLE" >/dev/null 2>&1 || true
}

echo "==> LAN=$LAN DEVICE=$DEVICE"
echo "==> Kenos (10)"
K="$ROOT/kenos"
launch_http "http://${LAN}:5219/?iosNativeShell=1"; sleep 3.4; shot "$K/01-today.png"
launch_http "http://${LAN}:5219/assistant?iosNativeShell=1"; sleep 3.2; shot "$K/02-assistant.png"
launch_http "http://${LAN}:5219/spaces?iosNativeShell=1"; sleep 3.2; shot "$K/03-spaces.png"
launch_http "http://${LAN}:5219/inbox?iosNativeShell=1"; sleep 3.2; shot "$K/04-inbox.png"
launch_http "http://${LAN}:5219/settings?iosNativeShell=1"; sleep 3.2; shot "$K/05-settings.png"
launch_http "http://${LAN}:5219/spaces/work?iosNativeShell=1"; sleep 3.2; shot "$K/06-spaces-work.png"
launch_http "http://${LAN}:5219/spaces/knowledge?iosNativeShell=1"; sleep 3.2; shot "$K/07-spaces-knowledge.png"
# Space switcher / continue via deep links when available
launch_kenos "kenos://shell?path=/"; sleep 2.8; shot "$K/08-shell-today-deeplink.png"
launch_http "http://${LAN}:5219/uiux-states?iosNativeShell=1"; sleep 3.2; shot "$K/09-uiux-states.png"
launch_http "http://${LAN}:5219/?iosNativeShell=1&v=board"; sleep 3.0; shot "$K/10-today-reload.png"

echo "==> Plan Domain (10)"
P="$ROOT/plan"
launch_http "http://${LAN}:5188/?iosNativeShell=1"; sleep 3.4; shot "$P/01-tasks.png"
launch_http "http://${LAN}:5188/calendar?iosNativeShell=1"; sleep 3.2; shot "$P/02-calendar.png"
launch_http "http://${LAN}:5188/projects?iosNativeShell=1"; sleep 3.2; shot "$P/03-projects.png"
launch_http "http://${LAN}:5188/search?iosNativeShell=1"; sleep 3.2; shot "$P/04-search.png"
launch_http "http://${LAN}:5188/upcoming?iosNativeShell=1"; sleep 3.2; shot "$P/05-upcoming.png"
launch_http "http://${LAN}:5188/inbox?iosNativeShell=1"; sleep 3.2; shot "$P/06-inbox.png"
launch_http "http://${LAN}:5188/completed?iosNativeShell=1"; sleep 3.2; shot "$P/07-completed.png"
launch_http "http://${LAN}:5188/insights?iosNativeShell=1"; sleep 3.2; shot "$P/08-insights.png"
launch_http "http://${LAN}:5188/settings?iosNativeShell=1"; sleep 3.2; shot "$P/09-settings.png"
# Shelf while in Plan domain — do NOT terminate (preserve Domain state + lastDomain URL).
launch_http "http://${LAN}:5188/?iosNativeShell=1"; sleep 2.8
xcrun devicectl device process launch --device "$DEVICE" \
  --payload-url "kenos://shelf" "$BUNDLE" >/dev/null 2>&1 || true
sleep 2.4; shot "$P/10-space-shelf.png"

echo "==> Training Domain (10)"
T="$ROOT/training"
launch_http "http://${LAN}:5190/?iosNativeShell=1"; sleep 3.4; shot "$T/01-today.png"
launch_http "http://${LAN}:5190/session?iosNativeShell=1"; sleep 3.6; shot "$T/02-session-workout.png"
launch_http "http://${LAN}:5190/library?iosNativeShell=1"; sleep 3.2; shot "$T/03-library.png"
launch_http "http://${LAN}:5190/discover/records?iosNativeShell=1"; sleep 3.2; shot "$T/04-history.png"
launch_http "http://${LAN}:5190/program?iosNativeShell=1"; sleep 3.2; shot "$T/05-program.png"
launch_http "http://${LAN}:5190/discover?iosNativeShell=1"; sleep 3.2; shot "$T/06-discover.png"
launch_http "http://${LAN}:5190/discover/stats?iosNativeShell=1"; sleep 3.2; shot "$T/07-stats.png"
launch_http "http://${LAN}:5190/settings?iosNativeShell=1"; sleep 3.2; shot "$T/08-settings.png"
launch_http "http://${LAN}:5190/discover/tools?iosNativeShell=1"; sleep 3.2; shot "$T/09-tools.png"
launch_http "http://${LAN}:5190/?iosNativeShell=1"; sleep 2.8
xcrun devicectl device process launch --device "$DEVICE" \
  --payload-url "kenos://shelf" "$BUNDLE" >/dev/null 2>&1 || true
sleep 2.4; shot "$T/10-space-shelf.png"

echo "CAPTURE_OK"
ls "$K" | wc -l
ls "$P" | wc -l
ls "$T" | wc -l
