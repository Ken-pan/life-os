#!/usr/bin/env bash
# Bypass native re-sign: installed Kenos on 17 Pro + fresh LAN Continuity web.
# Shell inject → Music/Finance probe via same-origin /__kenos_beacon (no :5299).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEVICE="${KENOS_IOS_DEVICE:-8097F071-CAB6-5AF0-8258-BCD985E9D79E}"
BUNDLE="space.kenos.app.ios"
REF="iueozzuctstwvzbcxcyh"
EMAIL="334452284ken@gmail.com"
LAN="$(ipconfig getifaddr en0)"
TRUST="${KENOS_DAILY_BETA_HOME:-$HOME/.kenos-daily-beta}/device-trust.json"
BEACON_DIR="${KENOS_BEACON_DIR:-$HOME/.kenos-daily-beta/beacons}"
if [[ -f "$TRUST" ]]; then
  ORIGIN="$(python3 -c "import json;print(json.load(open('$TRUST'))['shell']['origin'])" 2>/dev/null || true)"
fi
ORIGIN="${KENOS_DAILY_BETA_ORIGIN:-${ORIGIN:-http://${LAN}:5219}}"
MUSIC_ORIGIN="${ORIGIN%:*}:5189"
FINANCE_ORIGIN="${ORIGIN%:*}:5180"
# Companion STATIC_ROOT may be release snapshot OR monorepo build — write where the
# live :port process actually serves (SPA fallback otherwise returns index.html).
resolve_static_root() {
  local port="$1" fallback="$2"
  local pid root
  pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  if [[ -n "$pid" ]]; then
    root="$(ps eww -p "$pid" 2>/dev/null | tr ' ' '\n' | sed -n 's/^KENOS_STATIC_ROOT=//p' | head -1 || true)"
    if [[ -n "$root" && -d "$root" ]]; then
      printf '%s\n' "$root"
      return 0
    fi
  fi
  printf '%s\n' "$fallback"
}
AIOS_ROOT="$(resolve_static_root 5219 "$ROOT/apps/aios/build")"
MUSIC_ROOT="$(resolve_static_root 5189 "$ROOT/apps/music/build")"
FINANCE_ROOT="$(resolve_static_root 5180 "$ROOT/apps/finance/build")"
EVID="$ROOT/docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/logs/ios-sso-bypass-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$EVID" "$BEACON_DIR"
TMP="$(mktemp -d /tmp/kenos-sso-bypass-XXXXXX)"
chmod 700 "$TMP"

cleanup() {
  rm -f "$AIOS_ROOT/__ios_auth_bootstrap.html" "$AIOS_ROOT/__ios_auth_once.json" \
        "$MUSIC_ROOT/__ios_sso_probe.html" "$FINANCE_ROOT/__ios_sso_probe.html" || true
  rm -rf "$TMP" || true
}
trap cleanup EXIT

echo "==> ORIGIN=$ORIGIN"
echo "==> MUSIC=$MUSIC_ORIGIN FINANCE=$FINANCE_ORIGIN"
echo "==> AIOS_ROOT=$AIOS_ROOT"
echo "==> MUSIC_ROOT=$MUSIC_ROOT"
echo "==> FINANCE_ROOT=$FINANCE_ROOT"
echo "==> BEACON_DIR=$BEACON_DIR"
echo "==> EVID=$EVID"

rm -f "$BEACON_DIR"/aios-*-shell-inject.json \
      "$BEACON_DIR"/music-*-domain-probe.json \
      "$BEACON_DIR"/finance-*-domain-probe.json

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
s = json.loads(Path("$TMP/session.json").read_text())
assert s.get("access_token") and s.get("refresh_token"), s
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
<title>Kenos SSO Inject</title></head>
<body style="font-family:system-ui;padding:24px;background:#111;color:#eee">
<p id=s>SSO inject…</p>
<script>
(async function () {
  const sEl = document.getElementById('s');
  const withTimeout = (p, ms) => Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
  const ping = (body) => fetch('/__kenos_beacon/shell-inject', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(function () {});
  try {
    const res = await fetch('/__ios_auth_once.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('once ' + res.status);
    const session = await res.json();
    localStorage.setItem('life_os_auth', JSON.stringify(session));
    const tokens = { access_token: session.access_token, refresh_token: session.refresh_token };
    document.cookie = 'lifeos_shared_session=' + encodeURIComponent(JSON.stringify(tokens))
      + '; path=/; max-age=31536000; SameSite=Lax';
    const email = session.user && session.user.email;
    // Access-log first — installed builds may hang forever on native vault.
    try {
      await fetch('/__health?kenos_sso_shell=' + encodeURIComponent(email || 'fail'), { cache: 'no-store' });
    } catch (e) {}
    let vault = { attempted: false, ok: false };
    try {
      const report = window.kenosNative && window.kenosNative.reportAuthSession
        ? (p) => window.kenosNative.reportAuthSession(p)
        : (window.__KENOS_NATIVE_BRIDGE__ && window.__KENOS_NATIVE_BRIDGE__.call
          ? (p) => window.__KENOS_NATIVE_BRIDGE__.call('reportAuthSession', p)
          : null);
      if (report) {
        vault.attempted = true;
        const r = await withTimeout(report({
          signedIn: true,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          userId: (session.user && session.user.id) || '',
          email: email || '',
          host: location.hostname,
        }), 2500);
        vault.ok = !!(r && r.ok);
        vault.detail = { signedIn: !!(r && r.signedIn), userIdPresent: !!(r && r.userIdPresent) };
      }
    } catch (e) {
      vault.error = String(e && e.message || e);
    }
    const body = {
      ok: !!email, email: email || null, vault: vault,
      origin: location.origin, host: location.hostname
    };
    await ping(body);
    sEl.textContent = email ? ('注入成功 ' + email + (vault.ok ? ' +vault' : '')) : '写入失败';
  } catch (e) {
    sEl.textContent = String(e);
    await ping({ ok: false, error: String(e) });
    try {
      await fetch('/__health?kenos_sso_shell=error', { cache: 'no-store' });
    } catch (e2) {}
  }
})();
</script>
</body></html>
HTML

write_probe() {
  cat >"$1/__ios_sso_probe.html" <<'HTML'
<!doctype html>
<html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>SSO Probe</title></head>
<body style="font-family:system-ui;padding:24px;background:#0a0a0a;color:#eee">
<p id=s>probing…</p>
<script>
(async function () {
  const sEl = document.getElementById('s');
  const withTimeout = (p, ms) => Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
  const ping = (body) => fetch('/__kenos_beacon/domain-probe', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(function () {});
  const cookieMatch = document.cookie.match(/(?:^|; )lifeos_shared_session=([^;]+)/);
  let cookieOk = false;
  if (cookieMatch) {
    try {
      const t = JSON.parse(decodeURIComponent(cookieMatch[1]));
      cookieOk = !!(t && t.refresh_token);
    } catch (e) {}
  }
  let lsOk = false, lsEmail = null;
  try {
    const raw = localStorage.getItem('life_os_auth');
    if (raw) {
      const s = JSON.parse(raw);
      lsOk = !!(s && (s.access_token || (s.currentSession && s.currentSession.access_token)));
      lsEmail = (s.user && s.user.email)
        || (s.currentSession && s.currentSession.user && s.currentSession.user.email)
        || null;
    }
  } catch (e) {}
  let vault = { attempted: false, signedIn: false };
  try {
    const call = window.kenosNative && window.kenosNative.getSharedAuthTokens
      ? () => window.kenosNative.getSharedAuthTokens()
      : (window.__KENOS_NATIVE_BRIDGE__ && window.__KENOS_NATIVE_BRIDGE__.call
        ? () => window.__KENOS_NATIVE_BRIDGE__.call('getSharedAuthTokens', { host: location.hostname })
        : null);
    if (call) {
      vault.attempted = true;
      const r = await withTimeout(call(), 2500);
      vault.signedIn = !!(r && r.signedIn && r.refresh_token);
      vault.ok = !!(r && r.ok);
    }
  } catch (e) {
    vault.error = String(e && e.message || e);
  }
  const ok = cookieOk || lsOk || vault.signedIn;
  const body = {
    ok: ok,
    origin: location.origin,
    host: location.hostname,
    port: location.port,
    cookieOk: cookieOk,
    localStorageOk: lsOk,
    localStorageEmail: lsEmail,
    vault: vault,
  };
  sEl.textContent = ok
    ? ('SSO OK cookie=' + cookieOk + ' ls=' + lsOk + ' vault=' + vault.signedIn)
    : 'SSO MISS';
  try {
    var flag = ok ? 'pass' : 'miss';
    flag += '_c' + (cookieOk ? '1' : '0') + '_v' + (vault.signedIn ? '1' : '0') + '_l' + (lsOk ? '1' : '0');
    await fetch('/__health?kenos_sso_domain=' + encodeURIComponent(flag), { cache: 'no-store' });
  } catch (e) {}
  await ping(body);
})();
</script>
</body></html>
HTML
}
write_probe "$MUSIC_ROOT"
write_probe "$FINANCE_ROOT"

# Fail fast if companion would SPA-fallback (serve index.html for missing probe).
python3 - <<PY
import urllib.request
for label, url, needle in [
    ("aios", "$ORIGIN/__ios_auth_bootstrap.html", "Kenos SSO Inject"),
    ("music", "$MUSIC_ORIGIN/__ios_sso_probe.html", "SSO Probe"),
    ("finance", "$FINANCE_ORIGIN/__ios_sso_probe.html", "SSO Probe"),
]:
    body = urllib.request.urlopen(url, timeout=5).read().decode("utf-8", "replace")
    assert needle in body, (label, "SPA_FALLBACK_OR_WRONG_ROOT", body[:120])
    print("serve_ok", label, "bytes", len(body))
PY

launch_url() {
  local url="$1" label="$2"
  echo "==> launch $label $url"
  set +e
  # Prefer kenos:// (registered scheme). http payload-url is often dropped.
  xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
    --payload-url "$url" "$BUNDLE" >"$EVID/launch-$label.txt" 2>&1
  ec=$?
  set -e
  if [[ "$ec" -ne 0 ]] || grep -q Locked "$EVID/launch-$label.txt"; then
    echo "LAUNCH_FAIL $label ec=$ec"
    tail -8 "$EVID/launch-$label.txt" || true
    return 1
  fi
  echo "LAUNCH_OK $label"
}

wait_beacon() {
  local glob="$1" dest="$2" n="${3:-45}"
  for i in $(seq 1 "$n"); do
    # shellcheck disable=SC2086
    local hit
    hit="$(ls -t $glob 2>/dev/null | head -1 || true)"
    if [[ -n "$hit" && -f "$hit" ]]; then
      cp "$hit" "$dest"
      echo "HAVE $(basename "$dest")=$(cat "$dest")"
      return 0
    fi
    sleep 1
  done
  echo "TIMEOUT $glob"
  return 1
}

AIOS_LOG="$HOME/Library/Logs/KenosDailyBeta/aios.stderr.log"
MARK_A=$(wc -l <"$AIOS_LOG" 2>/dev/null || echo 0)
CB="$(date +%s)"
# Registered URL scheme — works without http association / re-sign.
launch_url "kenos://shell?path=/__ios_auth_bootstrap.html%3Fcb%3D${CB}" "shell" || exit 3
# Wait for POST beacon OR access-log GET beacon.
SHELL_OK=0
for i in $(seq 1 45); do
  hit="$(ls -t $BEACON_DIR/aios-*-shell-inject.json 2>/dev/null | head -1 || true)"
  if [[ -n "$hit" && -f "$hit" ]]; then
    cp "$hit" "$EVID/shell-inject.json"
    echo "HAVE shell-inject.json=$(cat "$EVID/shell-inject.json")"
    SHELL_OK=1
    break
  fi
  if [[ -f "$AIOS_LOG" ]] && tail -n +"$((MARK_A+1))" "$AIOS_LOG" 2>/dev/null | rg -q "kenos_sso_shell=334452284ken"; then
    echo '{"ok":true,"email":"334452284ken@gmail.com","via":"access-log"}' >"$EVID/shell-inject.json"
    SHELL_OK=1
    echo "HAVE shell-inject via access-log"
    break
  fi
  sleep 1
done
[[ "$SHELL_OK" -eq 1 ]] || { echo "SHELL_TIMEOUT"; tail -n +"$((MARK_A+1))" "$AIOS_LOG" 2>/dev/null | tail -30 || true; exit 4; }
python3 - <<PY
import json
d=json.load(open("$EVID/shell-inject.json"))
assert d.get("ok"), d
print("SHELL_INJECT_PASS", d.get("email"), "vault", d.get("vault"))
PY

rm -f "$BEACON_DIR"/music-*-domain-probe.json
: >"$EVID/music-log-marker.txt"
MUSIC_LOG="$HOME/Library/Logs/KenosDailyBeta/music.stderr.log"
MARK_M=$(wc -l <"$MUSIC_LOG" 2>/dev/null || echo 0)
launch_url "kenos://domain/music?path=/__ios_sso_probe.html" "music" || exit 5
MUSIC_OK=0
for i in $(seq 1 45); do
  if wait_beacon "$BEACON_DIR/music-*-domain-probe.json" "$EVID/music-probe.json" 1 2>/dev/null; then
    MUSIC_OK=1
    break
  fi
  if [[ -f "$MUSIC_LOG" ]] && tail -n +"$((MARK_M+1))" "$MUSIC_LOG" 2>/dev/null | rg -q "kenos_sso_domain=pass"; then
    echo '{"ok":true,"via":"access-log","cookieOk":null,"vault":{},"localStorageOk":null}' >"$EVID/music-probe.json"
    MUSIC_OK=1
    echo "HAVE music-probe via access-log"
    break
  fi
  sleep 1
done
[[ "$MUSIC_OK" -eq 1 ]] || { echo "MUSIC_TIMEOUT"; tail -30 "$MUSIC_LOG" || true; exit 6; }
python3 - <<PY
import json
d=json.load(open("$EVID/music-probe.json"))
print("MUSIC_PROBE", json.dumps(d, ensure_ascii=False))
assert d.get("ok"), ("MUSIC_SSO_FAIL", d)
print("MUSIC_SSO_PASS")
PY

rm -f "$BEACON_DIR"/finance-*-domain-probe.json
FIN_LOG="$HOME/Library/Logs/KenosDailyBeta/finance.stderr.log"
MARK_F=$(wc -l <"$FIN_LOG" 2>/dev/null || echo 0)
launch_url "kenos://domain/money?path=/__ios_sso_probe.html" "finance" || exit 7
FIN_OK=0
for i in $(seq 1 45); do
  if wait_beacon "$BEACON_DIR/finance-*-domain-probe.json" "$EVID/finance-probe.json" 1 2>/dev/null; then
    FIN_OK=1
    break
  fi
  if [[ -f "$FIN_LOG" ]] && tail -n +"$((MARK_F+1))" "$FIN_LOG" 2>/dev/null | rg -q "kenos_sso_domain=pass"; then
    echo '{"ok":true,"via":"access-log"}' >"$EVID/finance-probe.json"
    FIN_OK=1
    echo "HAVE finance-probe via access-log"
    break
  fi
  sleep 1
done
[[ "$FIN_OK" -eq 1 ]] || { echo "FINANCE_TIMEOUT"; tail -30 "$FIN_LOG" || true; exit 8; }
python3 - <<PY
import json
from pathlib import Path
d=json.load(open("$EVID/finance-probe.json"))
print("FINANCE_PROBE", json.dumps(d, ensure_ascii=False))
assert d.get("ok"), ("FINANCE_SSO_FAIL", d)
print("FINANCE_SSO_PASS")
evid = Path("$EVID")
summary = {
  "pass": True,
  "bypass": "installed-app + kenos:// deep link (no resign)",
  "origin": "$ORIGIN",
  "shell": json.loads((evid/"shell-inject.json").read_text()),
  "music": json.loads((evid/"music-probe.json").read_text()),
  "finance": d,
}
(evid/"summary.json").write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print("SSO_BYPASS_SMOKE_PASS")
PY
