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

mkdir -p "$(dirname "$CACHE_PATH")"
mkdir -p "$(dirname "$LAST_SYNC_PATH")"
TMP_CACHE="$(mktemp "${CACHE_PATH}.tmp.XXXXXX")"
TMP_SYNC="$(mktemp "${LAST_SYNC_PATH}.tmp.XXXXXX")"

cleanup() {
  rm -f "$TMP_CACHE" "$TMP_SYNC"
}
trap cleanup EXIT HUP INT TERM

# wget fails on non-2xx responses; validate the expected dashboard shape before
# replacing the last-good cache. This intentionally avoids parsing or logging
# the bearer token.
wget -q -O "$TMP_CACHE" \
  --header="Authorization: Bearer $TOKEN" \
  --header="Accept: application/json" \
  "$API_BASE/api/paper/today"

if [ ! -s "$TMP_CACHE" ] \
  || ! grep -Eq '^[[:space:]]*\{' "$TMP_CACHE" \
  || ! grep -Eq '"today"[[:space:]]*:' "$TMP_CACHE"; then
  echo "PaperOS cache refresh returned an invalid dashboard payload; keeping last-good cache." >&2
  exit 65
fi

date -u '+%Y-%m-%dT%H:%M:%SZ' > "$TMP_SYNC"
chmod 600 "$TMP_CACHE" "$TMP_SYNC"

# Both temporary files live beside their targets, so each mv is an atomic
# filesystem rename. A fetch or validation failure never touches either target.
mv "$TMP_CACHE" "$CACHE_PATH"
mv "$TMP_SYNC" "$LAST_SYNC_PATH"

echo "PaperOS cache refreshed: $CACHE_PATH"
