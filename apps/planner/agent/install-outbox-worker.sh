#!/bin/bash
# 安装/卸载/巡检 kenos-outbox-worker 的 launchd 常驻(KeepAlive)。
#   ./install-outbox-worker.sh            安装并启动(升级=重跑,同路径覆盖)
#   ./install-outbox-worker.sh uninstall  停止并卸载
#   ./install-outbox-worker.sh status     launchd 状态 + 最近日志
#   ./install-outbox-worker.sh health     跑一次 --once 周期(claim+deliver+metrics)
# 凭据放 ~/.kenos/outbox-worker.env(chmod 600),至少包含:
#   SUPABASE_SERVICE_ROLE_KEY=...
# 可选: SUPABASE_URL / KENOS_OUTBOX_EPOCH
# 紧急停用: touch ~/.kenos/outbox-worker.disable (worker 每轮轮询都会检查)
set -euo pipefail

LABEL="space.kenos.outbox-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="$SCRIPT_DIR/outbox-worker.mjs"
ENV_FILE="$HOME/.kenos/outbox-worker.env"
NODE_BIN="$(command -v node)"
LOG="$HOME/Library/Logs/kenos-outbox-worker.log"

case "${1:-install}" in
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "已卸载 $LABEL"
    exit 0
    ;;
  status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state|pid|last exit" || echo "$LABEL 未安装"
    [[ -f "$LOG" ]] && { echo "--- 最近日志 ---"; tail -5 "$LOG"; }
    exit 0
    ;;
  health)
    [[ -f "$ENV_FILE" ]] || { echo "缺 $ENV_FILE"; exit 1; }
    set -a; source "$ENV_FILE"; set +a
    exec "$NODE_BIN" "$WORKER" --once
    ;;
  install) ;;
  *) echo "用法: $0 [install|uninstall|status|health]"; exit 1 ;;
esac

[[ -x "$NODE_BIN" ]] || { echo "找不到 node,请先安装"; exit 1; }
[[ -f "$WORKER" ]] || { echo "找不到 $WORKER"; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "缺 $ENV_FILE(需含 SUPABASE_SERVICE_ROLE_KEY),chmod 600"; exit 1; }
chmod 600 "$ENV_FILE"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>set -a; source "$ENV_FILE"; set +a; exec "$NODE_BIN" --no-warnings "$WORKER"</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "已安装并启动 $LABEL(日志:$LOG)"
