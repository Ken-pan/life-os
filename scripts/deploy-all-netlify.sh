#!/usr/bin/env bash
# 本地构建并发布 Life OS 六站到 Netlify（需已 netlify login）
# Deploy source of truth = 当前 git HEAD。脏工作树禁止部署(共享工作树上会把
# 别人的半成品推上生产);确需覆盖用 KENOS_DEPLOY_ALLOW_DIRTY=1 并自担后果。
# 每站部署都会追加一行记录到 docs/ops/deploy-log/DEPLOY_LOG.ndjson
# (commit/site/time/actor),部署后请提交该文件,保证生产可追溯。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${KENOS_DEPLOY_ALLOW_DIRTY:-}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ 工作树不干净,拒绝部署(deploy source of truth = git HEAD)。" >&2
  echo "  先提交/暂存改动,或 KENOS_DEPLOY_ALLOW_DIRTY=1 显式覆盖。" >&2
  exit 1
fi

DEPLOY_COMMIT="$(git rev-parse HEAD)"
DEPLOY_ACTOR="$(git config user.name || echo unknown)@$(hostname -s)"
DEPLOY_LOG="docs/ops/deploy-log/DEPLOY_LOG.ndjson"
mkdir -p "$(dirname "$DEPLOY_LOG")"

record_deploy() {
  local site_id="$1" workspace="$2"
  printf '{"time":"%s","commit":"%s","site":"%s","workspace":"%s","actor":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$DEPLOY_COMMIT" "$site_id" "$workspace" "$DEPLOY_ACTOR" \
    >> "$DEPLOY_LOG"
}

npm run build

deploy_one() {
  local site_id="$1" workspace="$2" dir="$3" functions="${4:-}"
  # CI=1 + --filter：新版 CLI 在 monorepo 中会交互式询问项目，必须显式指定
  if [[ -n "$functions" ]]; then
    CI=1 npx netlify deploy --prod --no-build --site="$site_id" --filter "$workspace" --dir="$dir" --functions="$functions"
  else
    CI=1 npx netlify deploy --prod --no-build --site="$site_id" --filter "$workspace" --dir="$dir"
  fi
  record_deploy "$site_id" "$workspace"
}

deploy_one 82a6cadc-03f9-443c-85f7-26bd4a90f83f planner-os apps/planner/build netlify/functions
# Fitness / Finance：CLI --filter 下 functions 相对 apps/<app>（与 music/planner 同口径）。
# 漏传 --functions 时 /api/mcp 不会上线 → 生产 404（2026-07-18 实测）。
deploy_one 0394cf19-7fb7-4fea-81d7-d4a9d025fab3 fitness-os apps/fitness/build netlify/functions
deploy_one fc92f305-8dcf-46c3-82f5-ef511597df1c finance-os apps/finance/build netlify/functions
# Music: use --filter music-os; functions path is relative to apps/music (not repo root).
deploy_one 83dfdf84-095a-4b8a-955d-106d046a314b music-os apps/music/build netlify/functions
deploy_one a5df5c3e-0e42-4f82-aca8-8d6802da357f portal apps/portal/build .netlify/functions-internal
deploy_one 69d4c072-d153-499c-90a8-57909df461a4 home-os apps/home/build
deploy_one db79c378-38a9-401c-8108-1cf46bb7fce8 knowledge-os apps/knowledge/build
# UI/UX 审核画廊：纯静态，发布已提交的 public/（图片由 npm run qa:uiux-gallery 生成）。
deploy_one cadccd64-e40a-439d-865d-5be5b3741ff3 @life-os/uiux-review-gallery apps/uiux-review-gallery/public
# [app-generator:deploy-one] netlify-provision.mjs 在此行上方追加新站

echo "All Life OS sites deployed."
