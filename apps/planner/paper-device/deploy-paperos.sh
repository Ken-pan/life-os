#!/bin/sh
set -eu

DEVICE="${PAPEROS_DEVICE:-remarkable-pro-move}"
LEGACY="${PAPEROS_LEGACY_HOME:-/home/root/planneros-lite}"
TARGET="${PAPEROS_HOME:-/home/root/paperos}"
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

ssh "$DEVICE" "
  set -eu
  mkdir -p '$TARGET'
  if [ -x '$LEGACY/planneros-lite' ] && [ ! -e '$TARGET/paperos' ]; then
    cp '$LEGACY/planneros-lite' '$TARGET/paperos'
  fi
  if [ -r '$LEGACY/config.json' ] && [ ! -e '$TARGET/config.json' ]; then
    sed 's#/home/root/planneros-lite#/home/root/paperos#g' '$LEGACY/config.json' > '$TARGET/config.json'
  fi
"

scp \
  "$HERE/open-paperos.sh" \
  "$HERE/recover-xochitl.sh" \
  "$HERE/refresh-cache.sh" \
  "$HERE/paperos.service" \
  "$HERE/config.example.json" \
  "$DEVICE:$TARGET/"

ssh "$DEVICE" "
  set -eu
  cd '$TARGET'
  [ -e config.json ] || cp config.example.json config.json
  chmod 700 '$TARGET'
  chmod 755 open-paperos.sh recover-xochitl.sh refresh-cache.sh
  [ ! -e paperos ] || chmod 755 paperos
  chmod 600 config.json token cache.json last_sync.txt 2>/dev/null || true
  systemctl link '$TARGET/paperos.service' 2>/dev/null || true
  systemctl daemon-reload
  echo \"xochitl=\$(systemctl is-active xochitl || true)\"
  ls -la '$TARGET'
"
