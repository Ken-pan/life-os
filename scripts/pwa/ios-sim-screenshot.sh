#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="${1:-pwa-screenshot}"
OUT_DIR="${OUT_DIR:-${REPO_ROOT}/docs/ui-qa-screenshots/pwa/simulator/latest}"
mkdir -p "${OUT_DIR}"

OUT_PATH="${OUT_DIR}/${NAME}.png"
xcrun simctl io booted screenshot "${OUT_PATH}"

echo "Saved: ${OUT_PATH}"
