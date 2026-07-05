#!/usr/bin/env bash
# Deprecated: packages/theme and packages/sync are edited in-repo.
# Kept for one-off import from a local git clone if you still have one.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECTS="$(cd "$ROOT/.." && pwd)"
THEME_SRC="$PROJECTS/life-os-theme"
SYNC_SRC="$PROJECTS/life-os-sync"

rsync_theme() {
  local dest="$1"
  mkdir -p "$dest"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    "$THEME_SRC/" "$dest/"
}

rsync_sync() {
  local dest="$1"
  mkdir -p "$dest"
  rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    "$SYNC_SRC/" "$dest/"
}

if [[ "${1:-}" == "monorepo" || -z "${1:-}" ]]; then
  if [[ ! -d "$THEME_SRC" || ! -d "$SYNC_SRC" ]]; then
    echo "error: sibling life-os-theme / life-os-sync not found under $PROJECTS" >&2
    echo "Edit packages/theme and packages/sync directly in this monorepo." >&2
    exit 1
  fi
  rsync_theme "$ROOT/packages/theme"
  rsync_sync "$ROOT/packages/sync"
  echo "done: imported from local sibling clones into packages/*"
  exit 0
fi

echo "usage: $0 [monorepo]" >&2
echo "Legacy all-repos mode removed — standalone app repos are archived." >&2
exit 1
