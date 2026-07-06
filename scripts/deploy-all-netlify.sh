#!/usr/bin/env bash
# 本地构建并发布四端到 Netlify（需已 netlify login）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build

deploy_one() {
  local site_id="$1" dir="$2" functions="${3:-}"
  if [[ -n "$functions" ]]; then
    npx netlify deploy --prod --no-build --site="$site_id" --dir="$dir" --functions="$functions"
  else
    npx netlify deploy --prod --no-build --site="$site_id" --dir="$dir"
  fi
}

deploy_one 82a6cadc-03f9-443c-85f7-26bd4a90f83f apps/planner/build apps/planner/netlify/functions
deploy_one 0394cf19-7fb7-4fea-81d7-d4a9d025fab3 apps/fitness/build
deploy_one fc92f305-8dcf-46c3-82f5-ef511597df1c apps/finance/dist
deploy_one 83dfdf84-095a-4b8a-955d-106d046a314b apps/music/build

echo "All four Life OS sites deployed."
