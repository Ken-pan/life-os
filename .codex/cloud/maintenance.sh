#!/usr/bin/env bash
set -euo pipefail

cd /workspace/life-os

git status --short --branch
npm ci --no-audit --no-fund
