#!/bin/bash
# 安装/卸载/巡检 kenos-cursor-bridge 的 launchd 常驻(KeepAlive:崩溃自动拉起,开机自启)。
#   ./install-cursor-bridge.sh            安装并启动(升级=重跑,同路径覆盖)
#   ./install-cursor-bridge.sh uninstall  停止并卸载
#   ./install-cursor-bridge.sh status     launchd 状态 + 最近日志
#   ./install-cursor-bridge.sh health     探测 /health 端点
set -euo pipefail

LABEL="space.kenos.cursor-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/cursor-bridge.mjs"
NODE_BIN="$(command -v node)"
LOG="$HOME/Library/Logs/kenos-cursor-bridge.log"
PORT="${KENOS_CURSOR_BRIDGE_PORT:-5273}"

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
    curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" && echo || { echo "bridge 无响应(端口 $PORT)"; exit 1; }
    exit 0
    ;;
  install) ;;
  *) echo "用法: $0 [install|uninstall|status|health]"; exit 1 ;;
esac

[[ -x "$NODE_BIN" ]] || { echo "找不到 node,请先安装"; exit 1; }
[[ -f "$BRIDGE" ]] || { echo "找不到 $BRIDGE"; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--no-warnings</string>
    <string>$BRIDGE</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "已安装并启动 $LABEL(日志:$LOG)"
echo "注意:发送注入需要为 node 授权「辅助功能」(系统设置 → 隐私与安全性)。"
