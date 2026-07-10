#!/bin/sh
set -eu

BASE="${PAPEROS_HOME:-/home/root/paperos}"

# Stop the systemd-managed instance first, if installed.
systemctl stop paperos >/dev/null 2>&1 || true

# Kill any manually launched binaries — absolute or relative invocations of
# paperos, paperos.next, etc. (a "cd $BASE && ./paperos.next" process has no
# absolute path in its cmdline, so match the bare binary name).
paperos_pids() {
  ps | awk '/paperos(\.[a-z0-9]+)? -platform|\/paperos(\.[a-z0-9]+)?( |$)/ && !/awk/ { print $1 }'
}

for pid in $(paperos_pids); do
  kill "$pid" >/dev/null 2>&1 || true
done

sleep 1

for pid in $(paperos_pids); do
  kill -9 "$pid" >/dev/null 2>&1 || true
done

systemctl start xochitl
systemctl is-active xochitl
