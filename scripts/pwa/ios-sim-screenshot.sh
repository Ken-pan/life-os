#!/usr/bin/env bash
set -euo pipefail

NAME="${1:-pwa-screenshot}"
OUT_DIR="${OUT_DIR:-screenshots/pwa}"
mkdir -p "${OUT_DIR}"

OUT_PATH="${OUT_DIR}/${NAME}.png"
xcrun simctl io booted screenshot "${OUT_PATH}"

echo "Saved: ${OUT_PATH}"
