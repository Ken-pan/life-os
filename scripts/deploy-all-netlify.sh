#!/usr/bin/env bash
# 本地构建并发布 Life OS 六站到 Netlify（需已 netlify login）
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

deploy_one 82a6cadc-03f9-443c-85f7-26bd4a90f83f planner-os apps/planner/build netlify/functions
deploy_one 0394cf19-7fb7-4fea-81d7-d4a9d025fab3 fitness-os apps/fitness/build
deploy_one fc92f305-8dcf-46c3-82f5-ef511597df1c finance-os apps/finance/build
# Music: use --filter music-os; functions path is relative to apps/music (not repo root).
deploy_one 83dfdf84-095a-4b8a-955d-106d046a314b music-os apps/music/build netlify/functions
deploy_one a5df5c3e-0e42-4f82-aca8-8d6802da357f portal apps/portal/build .netlify/functions-internal
deploy_one 69d4c072-d153-499c-90a8-57909df461a4 home-os apps/home/build
deploy_one db79c378-38a9-401c-8108-1cf46bb7fce8 knowledge-os apps/knowledge/build
# [app-generator:deploy-one] netlify-provision.mjs 在此行上方追加新站

echo "All Life OS sites deployed."
