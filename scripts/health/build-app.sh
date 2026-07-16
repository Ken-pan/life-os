#!/usr/bin/env bash
# 构建原生 HealthOS.app 并安装到 /Applications(覆盖旧版)。
# 前端改动后跑这一条即可:npm run app:health
# Focus 代理独立于 app(launchd),更新代理用:bash apps/health/agent/install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$HOME/.cargo/env" 2>/dev/null || true

cd "$ROOT/apps/health"
npx tauri build

APP_SRC="$ROOT/apps/health/src-tauri/target/release/bundle/macos/HealthOS.app"
APP_DST="/Applications/HealthOS.app"
rm -rf "$APP_DST"
cp -R "$APP_SRC" "$APP_DST"
# 删掉构建产物副本,避免 Spotlight 出现两个 HealthOS.app
rm -rf "$APP_SRC"
rm -rf "$HOME/Applications/HealthOS.app"
echo "✔ 已安装 $APP_DST"
