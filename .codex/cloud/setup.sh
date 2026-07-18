#!/usr/bin/env bash
set -euo pipefail

cd /workspace/life-os

test -f package-lock.json
npm ci --no-audit --no-fund

node --version
npm --version
