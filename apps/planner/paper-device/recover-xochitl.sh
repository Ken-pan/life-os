#!/bin/sh
set -eu

BASE="${PAPEROS_HOME:-/home/root/paperos}"
APP="${PAPEROS_APP:-$BASE/paperos}"

for pid in $(ps | awk -v app="$APP" 'index($0, app) && $0 !~ /awk/ { print $1 }'); do
  kill "$pid" >/dev/null 2>&1 || true
done

sleep 1

for pid in $(ps | awk -v app="$APP" 'index($0, app) && $0 !~ /awk/ { print $1 }'); do
  kill -9 "$pid" >/dev/null 2>&1 || true
done

systemctl start xochitl
systemctl is-active xochitl
