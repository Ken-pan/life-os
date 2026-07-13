#!/usr/bin/env bash
# AIOS 一键启动器
# 用法: aios.sh [open|start|stop|status|rebuild]   (默认 open)
#   open    — 确保服务在跑,然后用 Chrome app 模式打开(默认)
#   start   — 只确保静态服务器在跑
#   stop    — 停掉静态服务器
#   status  — 查看状态
#   rebuild — 重新构建前端(服务器无需重启,刷新页面即生效)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${AIOS_PORT:-5219}"
URL="http://127.0.0.1:${PORT}"
LOG_DIR="$HOME/Library/Logs/LocalAI"
LOG="$LOG_DIR/aios-web.log"
BUILD_INDEX="$ROOT/apps/aios/build/index.html"

is_up() { curl -sf --max-time 1 "$URL/__health" >/dev/null 2>&1; }

ensure_build() {
  if [[ ! -f "$BUILD_INDEX" ]]; then
    echo "缺少构建产物,先构建 aios-os…"
    (cd "$ROOT" && npm run build -w aios-os)
  fi
}

start_server() {
  if is_up; then return 0; fi
  ensure_build
  mkdir -p "$LOG_DIR"
  nohup node "$ROOT/scripts/aios/serve.mjs" >>"$LOG" 2>&1 &
  disown
  for _ in $(seq 1 30); do
    is_up && return 0
    sleep 0.2
  done
  echo "aios-web 启动失败,看日志: $LOG" >&2
  exit 1
}

stop_server() {
  pkill -f "scripts/aios/serve.mjs" 2>/dev/null && echo "aios-web 已停止" || echo "aios-web 本来就没在跑"
}

case "${1:-open}" in
  open)
    start_server
    open -na "Google Chrome" --args --app="$URL"
    ;;
  start)
    start_server
    echo "aios-web 在跑 → $URL"
    ;;
  stop) stop_server ;;
  status)
    if is_up; then echo "aios-web 在跑 → $URL"; else echo "aios-web 未运行"; fi
    ;;
  rebuild)
    (cd "$ROOT" && npm run build -w aios-os)
    echo "已重建,刷新 AIOS 窗口即可(⌘R)"
    ;;
  *)
    echo "用法: aios.sh [open|start|stop|status|rebuild]" >&2
    exit 1
    ;;
esac
