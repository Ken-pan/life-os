#!/bin/sh
set -eu

BASE="${PAPEROS_HOME:-/home/root/paperos}"
CONFIG="${PAPEROS_CONFIG:-$BASE/config.json}"

json_value() {
  key="$1"
  sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$CONFIG" | head -n 1
}

if [ ! -r "$CONFIG" ]; then
  echo "PaperOS config is missing or unreadable: $CONFIG" >&2
  exit 78
fi

API_BASE="$(json_value apiBaseUrl)"
TOKEN_FILE="$(json_value tokenFile)"
CACHE_PATH="$(json_value cachePath)"
LAST_SYNC_PATH="$(json_value lastSyncPath)"

if [ -z "$API_BASE" ] || [ -z "$TOKEN_FILE" ] || [ -z "$CACHE_PATH" ] || [ -z "$LAST_SYNC_PATH" ]; then
  echo "PaperOS config is missing apiBaseUrl/tokenFile/cachePath/lastSyncPath" >&2
  exit 78
fi

if [ ! -r "$TOKEN_FILE" ]; then
  echo "PaperOS token file is missing or unreadable: $TOKEN_FILE" >&2
  exit 77
fi

TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
TMP="$CACHE_PATH.tmp"

mkdir -p "$(dirname "$CACHE_PATH")"
rm -f "$TMP"

wget -q -O "$TMP" \
  --header="Authorization: Bearer $TOKEN" \
  --header="Accept: application/json" \
  "$API_BASE/api/paper/today"

mv "$TMP" "$CACHE_PATH"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$LAST_SYNC_PATH"
chmod 600 "$CACHE_PATH" "$LAST_SYNC_PATH"

echo "PaperOS cache refreshed: $CACHE_PATH"
