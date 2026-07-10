#!/bin/sh
set -eu

BASE="${PAPEROS_HOME:-/home/root/paperos}"

# Stop the systemd-managed instance first, if installed.
systemctl stop paperos >/dev/null 2>&1 || true

# Kill any manually launched binaries: matches paperos, paperos.next, etc.
for pid in $(ps | awk -v base="$BASE/paperos" 'index($0, base) && $0 !~ /awk/ { print $1 }'); do
  kill "$pid" >/dev/null 2>&1 || true
done

sleep 1

for pid in $(ps | awk -v base="$BASE/paperos" 'index($0, base) && $0 !~ /awk/ { print $1 }'); do
  kill -9 "$pid" >/dev/null 2>&1 || true
done

systemctl start xochitl
systemctl is-active xochitl
