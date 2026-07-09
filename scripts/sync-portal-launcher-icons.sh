#!/usr/bin/env bash
# Copy each Life OS app's brand-circle marks into Portal launcher static assets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/portal/static/apps"

copy_pair() {
  local id="$1"
  local light="$2"
  local dark="$3"
  cp "$light" "$OUT/${id}-light-96.png"
  cp "$dark" "$OUT/${id}-dark-96.png"
}

copy_pair planner "$ROOT/apps/planner/static/brand-circle-light-96.png" "$ROOT/apps/planner/static/brand-circle-dark-96.png"
copy_pair fitness "$ROOT/apps/fitness/static/brand-circle-light-96.png" "$ROOT/apps/fitness/static/brand-circle-dark-96.png"
copy_pair music "$ROOT/apps/music/static/brand-circle-light-96.png" "$ROOT/apps/music/static/brand-circle-dark-96.png"
copy_pair finance "$ROOT/apps/finance/public/assets/brand/brand-circle-light-96.png" "$ROOT/apps/finance/public/assets/brand/brand-circle-dark-96.png"

echo "Synced Portal launcher brand marks -> apps/portal/static/apps/*-{light,dark}-96.png"
