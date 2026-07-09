#!/bin/sh
set -eu

BASE="${PAPEROS_HOME:-/home/root/paperos}"
APP="${PAPEROS_APP:-$BASE/paperos}"

pkill -f "$APP" >/dev/null 2>&1 || true
systemctl start xochitl
systemctl is-active xochitl
