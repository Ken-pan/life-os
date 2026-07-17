#!/usr/bin/env bash
# 构建原生 KnowledgeOS.app 并安装到 /Applications（覆盖旧版）。
# 前端改动后跑这一条即可：npm run app:knowledge
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$HOME/.cargo/env" 2>/dev/null || true

cd "$ROOT/apps/knowledge"
npx tauri build

APP_SRC="$ROOT/apps/knowledge/src-tauri/target/release/bundle/macos/KnowledgeOS.app"
APP_DST="/Applications/KnowledgeOS.app"
rm -rf "$APP_DST"
cp -R "$APP_SRC" "$APP_DST"
# 删掉构建产物副本，避免 Spotlight 出现两个 KnowledgeOS.app
rm -rf "$APP_SRC"
echo "✔ 已安装 $APP_DST"
