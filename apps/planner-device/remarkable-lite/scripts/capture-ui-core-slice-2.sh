#!/bin/sh
# PAPR.UI.2 Core Slice 2 screenshot gate — focused set from
# docs/qa/paperos-core-slice-2-ia.md §6.1, captured against real device data
# (no fixture injection exists for offline/no-cache/mixed-CJK states in this
# TestBridge; those remain a follow-up fixture-backed pass, not fabricated
# here). No fallback coordinate taps.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
PAPERCTL="$ROOT/apps/planner-device/remarkable-lite/scripts/paperctl"
OUT=${1:-"$ROOT/docs/ui-qa-screenshots/paperos/device/slice2-latest"}

mkdir -p "$OUT"

require_visible() {
  id=$1
  "$PAPERCTL" tree | python3 -c '
import json, sys
target = sys.argv[1]
data = json.load(sys.stdin)
nodes = data.get("tree", {}).get("nodes", [])
if not any(n.get("id") == target and n.get("visible") for n in nodes):
    raise SystemExit("required visible semantic ID is missing: " + target)
' "$id"
}

tap_visible() {
  id=$1
  require_visible "$id"
  "$PAPERCTL" tap "$id" >/dev/null
}

capture() {
  name=$1
  "$PAPERCTL" screenshot "$OUT/$name.png" >/dev/null
  printf '%s\n' "captured $OUT/$name.png"
}

"$PAPERCTL" doctor

# Return to a known state: Today via the Drawer.
tap_visible "shell.menu"
tap_visible "drawer.today"
require_visible "page.today"
capture "20-today-populated"

tap_visible "shell.menu"
require_visible "system.drawer"
capture "27-system-drawer-final-ia"

tap_visible "drawer.tasks"
require_visible "page.tasks"
capture "24-tasks-populated"

tap_visible "shell.menu"
tap_visible "drawer.documents"
require_visible "page.documents"
require_visible "documents.unavailable"
capture "25-documents-capability-unavailable"

tap_visible "shell.menu"
tap_visible "drawer.settings"
require_visible "page.settings"
capture "26-settings"

# Return to Today, leaving the shell in its default landing state.
tap_visible "shell.menu"
tap_visible "drawer.today"
require_visible "page.today"

printf '%s\n' "PAPR.UI.2 Core Slice 2 screenshot gate passed: $OUT"
