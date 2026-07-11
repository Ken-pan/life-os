#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SCRIPT="$ROOT/refresh-cache.sh"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

BASE="$TMP_ROOT/paperos"
BIN="$TMP_ROOT/bin"
mkdir -p "$BASE" "$BIN"
printf 'test-token\n' > "$BASE/token"
cat > "$BASE/config.json" <<EOF
{"apiBaseUrl":"https://example.invalid","tokenFile":"$BASE/token","cachePath":"$BASE/cache.json","lastSyncPath":"$BASE/last_sync.txt"}
EOF

cat > "$BIN/wget" <<'EOF'
#!/bin/sh
set -eu
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -O) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$out" ]
[ "${FAKE_WGET_MODE:-success}" != "fail" ] || exit 4
cp "$FAKE_PAYLOAD" "$out"
EOF
chmod 755 "$BIN/wget"

run_refresh() {
  PATH="$BIN:$PATH" PAPEROS_HOME="$BASE" "$SCRIPT"
}

printf '{"today":{},"tasks":[],"inbox":{}}\n' > "$TMP_ROOT/valid.json"
FAKE_PAYLOAD="$TMP_ROOT/valid.json" run_refresh
cmp "$TMP_ROOT/valid.json" "$BASE/cache.json"
test -s "$BASE/last_sync.txt"

printf '%s\n' 'last-good-cache' > "$BASE/cache.json"
printf '%s\n' '2026-01-01T00:00:00Z' > "$BASE/last_sync.txt"
FAKE_WGET_MODE=fail FAKE_PAYLOAD="$TMP_ROOT/valid.json" run_refresh 2>/dev/null && exit 1 || true
test "$(cat "$BASE/cache.json")" = 'last-good-cache'
test "$(cat "$BASE/last_sync.txt")" = '2026-01-01T00:00:00Z'

printf '<html>not a dashboard</html>\n' > "$TMP_ROOT/invalid.json"
FAKE_PAYLOAD="$TMP_ROOT/invalid.json" run_refresh 2>/dev/null && exit 1 || true
test "$(cat "$BASE/cache.json")" = 'last-good-cache'
test "$(cat "$BASE/last_sync.txt")" = '2026-01-01T00:00:00Z'

echo "refresh-cache tests passed"
