#!/usr/bin/env bash
# Owner APNs sandbox smoke — stays outside KenosNotifications (phase4b guard).
# Requires Apple .p8 key + device token from Settings → Advanced → Push.
#
#   export APNS_KEY_ID=...
#   export APNS_TEAM_ID=...
#   export APNS_AUTH_KEY=/path/to/AuthKey_XXXX.p8
#   export APNS_DEVICE_TOKEN=hex_from_settings
#   ./scripts/kenos-daily-beta/apns-smoke.sh
set -euo pipefail

BUNDLE_ID="${APNS_BUNDLE_ID:-space.kenos.app.ios}"
HOST="${APNS_HOST:-api.sandbox.push.apple.com}"
KEY_ID="${APNS_KEY_ID:-}"
TEAM_ID="${APNS_TEAM_ID:-}"
AUTH_KEY="${APNS_AUTH_KEY:-}"
DEVICE_TOKEN="${APNS_DEVICE_TOKEN:-}"

if [[ -z "$KEY_ID" || -z "$TEAM_ID" || -z "$AUTH_KEY" || -z "$DEVICE_TOKEN" ]]; then
  cat <<EOF
Missing env. Set:
  APNS_KEY_ID APNS_TEAM_ID APNS_AUTH_KEY APNS_DEVICE_TOKEN
Optional:
  APNS_BUNDLE_ID (default $BUNDLE_ID)
  APNS_HOST (default $HOST)
EOF
  exit 2
fi

[[ -f "$AUTH_KEY" ]] || { echo "APNS_AUTH_KEY not found: $AUTH_KEY" >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl required" >&2; exit 2; }
command -v python3 >/dev/null || { echo "python3 required" >&2; exit 2; }

JWT="$(
  KEY_ID="$KEY_ID" TEAM_ID="$TEAM_ID" AUTH_KEY="$AUTH_KEY" python3 <<'PY'
import base64, json, os, subprocess, tempfile, time
from pathlib import Path

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

def der_ecdsa_to_raw(der: bytes) -> bytes:
    """Parse DER SEQUENCE{INT r, INT s} → 64-byte r||s for ES256."""
    assert der[0] == 0x30
    idx = 2 if der[1] < 0x80 else 3
    assert der[idx] == 0x02
    idx += 1
    r_len = der[idx]
    idx += 1
    r = der[idx : idx + r_len]
    idx += r_len
    assert der[idx] == 0x02
    idx += 1
    s_len = der[idx]
    idx += 1
    s = der[idx : idx + s_len]
    r = r.lstrip(b"\x00") or b"\x00"
    s = s.lstrip(b"\x00") or b"\x00"
    return r.rjust(32, b"\x00") + s.rjust(32, b"\x00")

key_id = os.environ["KEY_ID"]
team_id = os.environ["TEAM_ID"]
key_path = os.environ["AUTH_KEY"]
header = b64url(json.dumps({"alg": "ES256", "kid": key_id}, separators=(",", ":")).encode())
claims = b64url(json.dumps({"iss": team_id, "iat": int(time.time())}, separators=(",", ":")).encode())
signing_input = f"{header}.{claims}".encode()
with tempfile.NamedTemporaryFile(delete=False) as sigf:
    sig_path = sigf.name
try:
    subprocess.check_call(
        ["openssl", "dgst", "-sha256", "-sign", key_path, "-out", sig_path],
        input=signing_input,
    )
    raw = der_ecdsa_to_raw(Path(sig_path).read_bytes())
finally:
    Path(sig_path).unlink(missing_ok=True)
print(f"{header}.{claims}.{b64url(raw)}")
PY
)"

PAYLOAD='{"aps":{"alert":{"title":"Kenos","body":"APNs smoke"},"sound":"default"},"kenosType":"sync_failure","kenosDeepLink":"kenos://today"}'

echo "→ POST https://${HOST}/3/device/${DEVICE_TOKEN:0:12}… bundle=${BUNDLE_ID}"
HTTP_CODE="$(
  curl -sS -o /tmp/kenos-apns-smoke.body -w "%{http_code}" \
    --http2 \
    -H "authorization: bearer ${JWT}" \
    -H "apns-topic: ${BUNDLE_ID}" \
    -H "apns-push-type: alert" \
    -H "apns-priority: 10" \
    -d "$PAYLOAD" \
    "https://${HOST}/3/device/${DEVICE_TOKEN}"
)"
echo "HTTP ${HTTP_CODE}"
cat /tmp/kenos-apns-smoke.body
echo
[[ "$HTTP_CODE" == "200" ]] || exit 1
echo "APNS_SMOKE: PASS"
