#!/usr/bin/env bash
# 构建原生 AIOS.app 并安装到 ~/Applications(覆盖旧版)。
# 前端改动后跑这一条即可:npm run app:aios
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$HOME/.cargo/env" 2>/dev/null || true

cd "$ROOT/apps/aios"
npx tauri build

APP_SRC="$ROOT/apps/aios/src-tauri/target/release/bundle/macos/AIOS.app"
APP_DST="$HOME/Applications/AIOS.app"
rm -rf "$APP_DST"
cp -R "$APP_SRC" "$APP_DST"
# 删掉构建产物副本,避免 Spotlight 出现两个 AIOS.app
rm -rf "$APP_SRC"
echo "✔ 已安装 $APP_DST"
