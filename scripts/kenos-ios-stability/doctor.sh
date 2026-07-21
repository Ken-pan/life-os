#!/usr/bin/env bash
# kenos-ios-doctor — stability-oriented doctor (device + services + rollback).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EVID="${1:-$ROOT/docs/qa/evidence/kenos-ios-stability-2026-07-21}"
mkdir -p "$EVID/logs"
export KENOS_STATIC_BIND=0.0.0.0

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HEAD="$(git -C "$ROOT" rev-parse HEAD)"
BUILD_SHA="$(cat "$HOME/.kenos-daily-beta/ios-build-sha.txt" 2>/dev/null || echo unknown)"
BUILD_NUM="$(cat "$HOME/.kenos-daily-beta/ios-build-number.txt" 2>/dev/null || echo unknown)"
ORIGIN="$(cat "$HOME/.kenos-daily-beta/lan-origin.txt" 2>/dev/null || true)"
LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
ORIGIN="${ORIGIN:-${KENOS_DAILY_BETA_ORIGIN:-http://${LAN}:5219}}"

{
  echo "==> kenos-ios-doctor $ts"
  echo "HEAD=$HEAD"
  echo "ios_build_sha=$BUILD_SHA"
  echo "ios_build_number=$BUILD_NUM"
  echo "origin=$ORIGIN"
  echo "--- device ---"
  bash "$ROOT/scripts/kenos-ios-daily-beta/ios-beta-doctor.sh" "$EVID" || true
  echo "--- kenos-ctl ---"
  bash "$ROOT/scripts/kenos-daily-beta/kenos-ctl.sh" doctor || true
  echo "--- rollback ---"
  if [[ -e "$HOME/.kenos-daily-beta/previous" ]]; then
    echo "[PASS] previous release present"
    readlink "$HOME/.kenos-daily-beta/previous" 2>/dev/null || ls "$HOME/.kenos-daily-beta/previous" | head -3
  else
    echo "[WARN] no previous release"
  fi
  echo "--- launchd ---"
  launchctl print "gui/$(id -u)" 2>/dev/null | grep -E 'kenos-daily-beta' || true
  echo "Doctor done $ts"
} | tee "$EVID/logs/doctor-$(date -u +%Y%m%dT%H%M%SZ).txt"

# Machine-readable summary (no secrets)
python3 - <<PY
import json, pathlib, datetime, os, subprocess
evid = pathlib.Path("$EVID")
out = {
  "ts": datetime.datetime.utcnow().isoformat()+"Z",
  "head": "$HEAD",
  "iosBuildSha": "$BUILD_SHA",
  "iosBuildNumber": "$BUILD_NUM",
  "originHost": None,
  "services": {},
  "rollback": pathlib.Path(os.path.expanduser("~/.kenos-daily-beta/previous")).exists(),
}
try:
  from urllib.parse import urlparse
  out["originHost"] = urlparse("$ORIGIN").netloc
except Exception:
  pass
import urllib.request
for name, port in [("aios",5219),("planner",5188),("fitness",5190),("finance",5180),("knowledge",5879),("music",5189),("home",5196),("health",5192)]:
  ok=False
  for path in ("/__health","/"):
    try:
      urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=2)
      ok=True
      break
    except Exception:
      pass
  out["services"][name]=ok
(evid/"smoke"/"doctor-latest.json").write_text(json.dumps(out, indent=2)+"\n")
print(json.dumps({"verdict": "PASS" if out["services"].get("aios") else "FAIL", **{k:out[k] for k in ("iosBuildNumber","rollback")}}, indent=2))
PY
