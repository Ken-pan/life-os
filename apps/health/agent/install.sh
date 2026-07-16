#!/usr/bin/env bash
# 编译并安装 healthos-focus-agent(launchd 常驻),同时下线旧的 vibeguard。
# 用法:bash apps/health/agent/install.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DATA="$HOME/Library/Application Support/HealthOS"
BIN_DIR="$DATA/bin"
BIN="$BIN_DIR/healthos-focus-agent"
LABEL="com.kenpan.healthos-focus"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$BIN_DIR"

echo "→ 编译 FocusAgent.swift"
xcrun swiftc -O "$DIR/FocusAgent.swift" -o "$BIN.new"
mv "$BIN.new" "$BIN"

echo "→ 下线旧 vibeguard(如在运行)"
launchctl bootout "gui/$(id -u)/com.kenpan.vibeguard" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.kenpan.vibeguard.plist"

echo "→ 写入 LaunchAgent"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BIN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$DATA/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$DATA/stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "✔ healthos-focus-agent 已安装并启动"
echo "  状态端点  http://127.0.0.1:5193/state"
echo "  数据目录  $DATA"
echo "  暂停开关  touch \"$DATA/pause\"(兼容 touch ~/.vibeguard/pause)"
