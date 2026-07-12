#!/usr/bin/env bash
# Run the Design Catalog visual suite in the same pinned environment as CI.
# Extra Playwright arguments are forwarded, for example:
# npm run test:design-catalog:snapshots:canonical -- --update-snapshots --grep '@visual.*tokens'
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PW_VERSION="1.61.1"
PW_IMAGE="mcr.microsoft.com/playwright:v1.61.1-noble"

cd "$ROOT"
docker run --rm \
  --ipc=host \
  --user "$(id -u):$(id -g)" \
  -v "$ROOT:/work" \
  --tmpfs /work/node_modules:rw,exec,mode=1777 \
  -w /work \
  -e CI=1 \
  -e EXPECTED_PLAYWRIGHT_VERSION="$PW_VERSION" \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/npm-cache \
  -e PLAYWRIGHT_DOCKER_IMAGE="$PW_IMAGE" \
  "$PW_IMAGE" \
  bash -lc '
    npm ci
    playwright_version="$(node -p "require(\"@playwright/test/package.json\").version")"
    echo "Docker image: ${PLAYWRIGHT_DOCKER_IMAGE}"
    echo "Node: $(node --version)"
    echo "Playwright: ${playwright_version}"
    cat /etc/os-release
    test "${playwright_version}" = "${EXPECTED_PLAYWRIGHT_VERSION}"
    npm run build -w design-catalog
    npm run test:design-catalog:snapshots -- "$@"
  ' bash "$@"
