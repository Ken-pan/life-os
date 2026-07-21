#!/usr/bin/env bash
# One-shot: generate session, serve bootstrap on Daily Beta origin, inject on unlocked 17 Pro.
set -euo pipefail

DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
BUNDLE="space.kenos.app.ios"
LAN="$(ipconfig getifaddr en0)"
ORIGIN="http://${LAN}:5219"
REF="iueozzuctstwvzbcxcyh"
EMAIL="334452284ken@gmail.com"
AIOS_ROOT="${HOME}/.kenos-daily-beta/current/apps/aios/build"
EVIDENCE="${1:-$(cd "$(dirname "$0")/../.." && pwd)/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21}"
TMP="$(mktemp -d /tmp/kenos-auth-inject-XXXXXX)"
chmod 700 "$TMP"
cleanup() {
  rm -f "$AIOS_ROOT/__ios_auth_bootstrap.html" "$AIOS_ROOT/__ios_auth_once.json" || true
  rm -rf "$TMP" || true
  kill "${LPID:-}" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$EVIDENCE/logs"
rm -f "$EVIDENCE/logs/auth-result-post.json"

security find-generic-password -s "Supabase CLI" -a "supabase" -w >"$TMP/cli.tok"
curl -sS "https://api.supabase.com/v1/projects/${REF}/api-keys" \
  -H "Authorization: Bearer $(cat "$TMP/cli.tok")" >"$TMP/keys.json"
python3 - <<PY
import json
from pathlib import Path
tmp = Path("$TMP")
keys = json.loads((tmp / "keys.json").read_text())
(tmp / "sr").write_text(next(k["api_key"] for k in keys if k.get("name") == "service_role"))
(tmp / "anon").write_text(next(k["api_key"] for k in keys if k.get("name") == "anon"))
print("keys_ok")
PY

curl -sS "https://${REF}.supabase.co/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer $(cat "$TMP/sr")" \
  -H "apikey: $(cat "$TMP/sr")" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"email\":\"${EMAIL}\"}" >"$TMP/link.json"
HASH="$(python3 -c "import json; print(json.load(open('$TMP/link.json'))['hashed_token'])")"
curl -sS "https://${REF}.supabase.co/auth/v1/verify" \
  -H "apikey: $(cat "$TMP/anon")" \
  -H "Authorization: Bearer $(cat "$TMP/anon")" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"email\",\"token_hash\":\"${HASH}\"}" >"$TMP/session.json"

python3 - <<PY
import json, time
from pathlib import Path
tmp = Path("$TMP")
s = json.loads((tmp / "session.json").read_text())
assert s.get("access_token"), s
session = {
  "access_token": s["access_token"],
  "token_type": s.get("token_type") or "bearer",
  "expires_in": s.get("expires_in"),
  "expires_at": s.get("expires_at") or int(time.time()) + int(s.get("expires_in") or 3600),
  "refresh_token": s["refresh_token"],
  "user": s.get("user"),
}
Path("$AIOS_ROOT/__ios_auth_once.json").write_text(json.dumps(session))
print("session_email", session["user"].get("email"))
PY

cat >"$AIOS_ROOT/__ios_auth_bootstrap.html" <<'HTML'
<!doctype html>
<html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Kenos Auth</title></head>
<body style="font-family:system-ui;padding:24px;background:#111;color:#eee">
<p id=s>登录中…</p>
<script>
(async function () {
  const key = 'sb-iueozzuctstwvzbcxcyh-auth-token';
  const sEl = document.getElementById('s');
  try {
    const res = await fetch('/__ios_auth_once.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('once ' + res.status);
    const session = await res.json();
    localStorage.setItem(key, JSON.stringify(session));
    const got = localStorage.getItem(key);
    const parsed = got ? JSON.parse(got) : null;
    const email = parsed && parsed.user && parsed.user.email;
    await fetch('http://' + location.hostname + ':5299/auth-result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: !!email, email: email || null, keyPresent: !!got, origin: location.origin })
    }).catch(function () {});
    sEl.textContent = email ? ('已登录 ' + email) : '已写入会话';
    setTimeout(function () { location.replace('/settings?iosNativeShell=1#cloud'); }, 400);
  } catch (e) {
    sEl.textContent = String(e);
    await fetch('http://' + location.hostname + ':5299/auth-result', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e) })
    }).catch(function () {});
  }
})();
</script>
</body></html>
HTML

python3 - <<'PY' &
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
out = Path("/Users/kenpan/「Projects」/life-os/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/logs/auth-result-post.json")
class H(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST,OPTIONS")
        self.end_headers()
    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(n)
        out.write_bytes(body)
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
        print("GOT", body.decode(), flush=True)
    def log_message(self, *a):
        pass
HTTPServer(("0.0.0.0", 5299), H).handle_request()
PY
LPID=$!

echo "Waiting for unlock + launching bootstrap…"
for i in $(seq 1 48); do
  set +e
  xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
    --payload-url "${ORIGIN}/__ios_auth_bootstrap.html" \
    "$BUNDLE" >"$TMP/launch.txt" 2>&1
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]] && ! grep -q Locked "$TMP/launch.txt"; then
    echo "LAUNCH_OK i=$i"
    break
  fi
  if grep -q Locked "$TMP/launch.txt"; then
    echo "locked $i"
  else
    echo "launch_fail $i ec=$ec"
    tail -3 "$TMP/launch.txt" || true
  fi
  if [[ "$i" -eq 48 ]]; then
    echo "TIMEOUT_LOCKED" | tee "$EVIDENCE/logs/auth-inject-status.txt"
    exit 3
  fi
  sleep 5
done

for i in $(seq 1 30); do
  if [[ -f "$EVIDENCE/logs/auth-result-post.json" ]]; then
    echo "AUTH_RESULT=$(cat "$EVIDENCE/logs/auth-result-post.json")"
    cp "$EVIDENCE/logs/auth-result-post.json" "$EVIDENCE/logs/auth-inject-status.json"
    exit 0
  fi
  sleep 1
done

echo "NO_RESULT_PING" | tee "$EVIDENCE/logs/auth-inject-status.txt"
# still open settings in case storage wrote but ping blocked by ATS
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
  --payload-url "${ORIGIN}/settings?iosNativeShell=1#cloud" \
  "$BUNDLE" >/dev/null 2>&1 || true
exit 4
