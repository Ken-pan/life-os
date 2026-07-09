#!/bin/sh
set -eu

BASE="${PAPEROS_HOME:-/home/root/paperos}"
APP="${PAPEROS_APP:-$BASE/paperos}"

cleanup() {
  systemctl start xochitl >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM HUP

if [ ! -x "$APP" ]; then
  echo "PaperOS binary is missing or not executable: $APP" >&2
  exit 127
fi

cd "$BASE"
systemctl stop xochitl
QT_QUICK_BACKEND="${QT_QUICK_BACKEND:-epaper}" "$APP" -platform epaper "$@"
