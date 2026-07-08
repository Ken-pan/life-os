#!/usr/bin/env bash
# Generate Linux-compatible Playwright snapshot baselines inside the official image.
# Usage: ./scripts/design-catalog-snapshots-docker.sh [--update-snapshots]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PW_IMAGE="${PLAYWRIGHT_DOCKER_IMAGE:-mcr.microsoft.com/playwright:v1.51.1-noble}"
UPDATE="${1:-}"

cd "$ROOT"
docker run --rm \
  -v "$ROOT:/work" \
  -w /work \
  -e CI=1 \
  "$PW_IMAGE" \
  bash -lc "npm ci && npm run build -w design-catalog && npx playwright test -c playwright.design-catalog.config.ts --grep @visual --project catalog-desktop ${UPDATE}"
