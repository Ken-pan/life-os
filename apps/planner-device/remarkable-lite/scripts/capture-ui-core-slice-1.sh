#!/bin/sh
# P-MOVE-UI Core Slice 1 screenshot gate.
#
# This runner intentionally has no fallback coordinate taps and never invokes
# notes.new.  It is safe to use against a debug shell because it only navigates
# semantic test IDs and captures the framebuffer.  A missing ID is a failed
# integration contract, not a reason to guess a route by coordinates.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
PAPERCTL="$ROOT/apps/planner-device/remarkable-lite/scripts/paperctl"
OUT=${1:-"$ROOT/docs/ui-qa-screenshots/paperos/device/latest"}

mkdir -p "$OUT"

state() {
  "$PAPERCTL" state
}

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

wait_visible() {
  id=$1
  attempts=0
  until require_visible "$id" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 40 ]; then
      echo "timed out waiting for visible semantic ID: $id" >&2
      return 1
    fi
    sleep 0.25
  done
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

first_visible_note() {
  "$PAPERCTL" tree | python3 -c '
import json, sys
nodes = json.load(sys.stdin).get("tree", {}).get("nodes", [])
ids = sorted(n.get("id", "") for n in nodes
             if n.get("visible") and n.get("id", "").startswith("notes.item."))
if not ids:
    raise SystemExit("no visible notes.item.<noteId>; seed one test notebook without using this runner")
print(ids[0])
'
}

# Required Core Slice 1 semantic UI contract.  These are intentionally
# objectName-based so TestBridge can assert routes without screen coordinates.
# The Fable branch supplies the QML IDs; C++ owns native-ink state only.
"$PAPERCTL" doctor

tap_visible "nav.home"
require_visible "shell.closed"
capture "01-shell-closed"

tap_visible "shell.menu"
require_visible "system.drawer"
capture "02-system-drawer-open"

tap_visible "drawer.notes"
require_visible "notes.collection.recent"
capture "03-notes-recent"

tap_visible "notes.collection.all"
require_visible "notes.collection.all"
# Re-enter through semantic navigation so the e-paper scenegraph paints the
# complete All collection before capture, rather than exposing only its
# incremental tab-change back buffer.
tap_visible "nav.home"
tap_visible "shell.menu"
tap_visible "drawer.notes"
require_visible "notes.collection.all"
capture "04-notes-all"

note_id=$(first_visible_note)
tap_visible "$note_id"
wait_visible "editor.clean"
capture "05-notebook-opened"
capture "06-editor-clean"

tap_visible "editor.chrome.handle"
wait_visible "editor.tools.revealed"
capture "07-editor-tools-revealed"

# This must be a pre-seeded, read-only visual fixture.  The runner never
# injects pen input or calls an API that persists a stroke.
tap_visible "editor.fixture.after-writing"
wait_visible "editor.after-writing"
capture "08-editor-after-writing"

printf '%s\n' "P-MOVE-UI Core Slice 1 screenshot gate passed: $OUT"
