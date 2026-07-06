#!/usr/bin/env bash
# 本地构建并发布四端到 Netlify（需已 netlify login）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build

deploy_one() {
  local site_id="$1" workspace="$2" dir="$3" functions="${4:-}"
  # CI=1 + --filter：新版 CLI 在 monorepo 中会交互式询问项目，必须显式指定
  if [[ -n "$functions" ]]; then
    CI=1 npx netlify deploy --prod --no-build --site="$site_id" --filter "$workspace" --dir="$dir" --functions="$functions"
  else
    CI=1 npx netlify deploy --prod --no-build --site="$site_id" --filter "$workspace" --dir="$dir"
  fi
}

deploy_one 82a6cadc-03f9-443c-85f7-26bd4a90f83f planner-os apps/planner/build apps/planner/netlify/functions
deploy_one 0394cf19-7fb7-4fea-81d7-d4a9d025fab3 fitness-os apps/fitness/build
deploy_one fc92f305-8dcf-46c3-82f5-ef511597df1c finance-os apps/finance/dist
deploy_one 83dfdf84-095a-4b8a-955d-106d046a314b music-os apps/music/build

echo "All four Life OS sites deployed."
