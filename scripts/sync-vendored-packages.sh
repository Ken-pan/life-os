#!/usr/bin/env bash
# 将 canonical 共享包同步到 monorepo packages/ 或各 app 的 packages/  vendored 目录
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

case "${1:-monorepo}" in
  monorepo)
    rsync_theme "$ROOT/packages/theme"
    rsync_sync "$ROOT/packages/sync"
    ;;
  all-repos)
    for app in Planner Fitness Moneymoneymoney MusicOS; do
      base="$PROJECTS/$app"
      [[ -d "$base" ]] || continue
      rsync_theme "$base/packages/life-os-theme"
      rsync_sync "$base/packages/life-os-sync"
      echo "synced $app"
    done
    ;;
  *)
    echo "usage: $0 [monorepo|all-repos]" >&2
    exit 1
    ;;
esac

echo "done: ${1:-monorepo}"
