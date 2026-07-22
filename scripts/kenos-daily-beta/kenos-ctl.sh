#!/usr/bin/env bash
# Kenos Personal Daily Beta — stable local release control plane.
# Usage: kenos-ctl.sh <start|stop|restart|status|doctor|build|install|uninstall|rollback|open|snapshot>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CTL_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="${KENOS_DAILY_BETA_HOME:-$HOME/.kenos-daily-beta}"
RELEASES="$STATE_DIR/releases"
CURRENT="$STATE_DIR/current"
PREVIOUS="$STATE_DIR/previous"
LOG_DIR="$HOME/Library/Logs/KenosDailyBeta"
META="$CURRENT/release.json"
UID_NUM="$(id -u)"
GUI="gui/${UID_NUM}"

AIOS_PORT="${KENOS_AIOS_PORT:-5219}"
PLANNER_PORT="${KENOS_PLANNER_PORT:-5188}"
FITNESS_PORT="${KENOS_FITNESS_PORT:-5190}"
# Continuity companions (SSOT: domainIntegration.core.js / KenosDomainRegistry.swift)
FINANCE_PORT="${KENOS_FINANCE_PORT:-5180}"
KNOWLEDGE_PORT="${KENOS_KNOWLEDGE_PORT:-5879}"
MUSIC_PORT="${KENOS_MUSIC_PORT:-5189}"
HOME_PORT="${KENOS_HOME_PORT:-5196}"
HEALTH_PORT="${KENOS_HEALTH_PORT:-5192}"

AIOS_URL="http://127.0.0.1:${AIOS_PORT}"
PLANNER_URL="http://127.0.0.1:${PLANNER_PORT}"
FITNESS_URL="http://127.0.0.1:${FITNESS_PORT}"
FINANCE_URL="http://127.0.0.1:${FINANCE_PORT}"
KNOWLEDGE_URL="http://127.0.0.1:${KNOWLEDGE_PORT}"
MUSIC_URL="http://127.0.0.1:${MUSIC_PORT}"
HOME_URL="http://127.0.0.1:${HOME_PORT}"
HEALTH_URL="http://127.0.0.1:${HEALTH_PORT}"

LABEL_AIOS="com.kenpan.kenos-daily-beta.aios"
LABEL_PLANNER="com.kenpan.kenos-daily-beta.planner"
LABEL_FITNESS="com.kenpan.kenos-daily-beta.fitness"
LABEL_FINANCE="com.kenpan.kenos-daily-beta.finance"
LABEL_KNOWLEDGE="com.kenpan.kenos-daily-beta.knowledge"
LABEL_MUSIC="com.kenpan.kenos-daily-beta.music"
LABEL_HOME="com.kenpan.kenos-daily-beta.home"
LABEL_HEALTH="com.kenpan.kenos-daily-beta.health"

# Core Daily Beta release apps (snapshotted under ~/.kenos-daily-beta/current).
CORE_LABELS=("$LABEL_AIOS" "$LABEL_PLANNER" "$LABEL_FITNESS")
# Continuity companions serve live apps/<id>/build (not release snapshot).
COMPANION_SPECS=(
  "finance:${LABEL_FINANCE}:${FINANCE_PORT}:${FINANCE_URL}"
  "knowledge:${LABEL_KNOWLEDGE}:${KNOWLEDGE_PORT}:${KNOWLEDGE_URL}"
  "music:${LABEL_MUSIC}:${MUSIC_PORT}:${MUSIC_URL}"
  "home:${LABEL_HOME}:${HOME_PORT}:${HOME_URL}"
  "health:${LABEL_HEALTH}:${HEALTH_PORT}:${HEALTH_URL}"
)

NODE_BIN="${KENOS_NODE_BIN:-$(command -v node)}"
PYTHON_BIN="${KENOS_PYTHON_BIN:-$(command -v python3)}"
# Prefer Python static server — Node LAN bind is blocked by macOS Application Firewall
# on this host (TCP accept, empty HTTP). Mac loopback still works with either.
SERVE_BIN="$STATE_DIR/bin/serve-static.py"
SERVE_JS="$STATE_DIR/bin/serve-static.mjs"

mkdir -p "$STATE_DIR" "$RELEASES" "$LOG_DIR" "$STATE_DIR/bin"

die() { echo "ERROR: $*" >&2; exit 1; }

http_ok() {
  local url="$1"
  curl -sf --max-time 2 "$url" >/dev/null 2>&1
}

sync_serve_bin() {
  cp "$CTL_DIR/serve-static.py" "$SERVE_BIN"
  cp "$CTL_DIR/serve-static.mjs" "$SERVE_JS"
  cp "$CTL_DIR/localai-proxy-path.mjs" "$STATE_DIR/bin/localai-proxy-path.mjs"
  chmod +x "$SERVE_BIN"
}

write_plist() {
  local label="$1" app="$2" port="$3" root_or_rel="$4"
  local plist="$HOME/Library/LaunchAgents/${label}.plist"
  local root_abs
  if [[ "$root_or_rel" == /* ]]; then
    root_abs="$root_or_rel"
  else
    root_abs="$CURRENT/apps/${root_or_rel}/build"
  fi
  local log_out="$LOG_DIR/${app}.stdout.log"
  local log_err="$LOG_DIR/${app}.stderr.log"
  # Only AIOS shell exposes /__localai — Continuity companions stay closed.
  local proxy_flag="0"
  if [[ "$app" == "aios" ]]; then
    proxy_flag="1"
  fi
  # Resolve symlink so launchd does not depend on live symlink races
  [[ -d "$root_abs" ]] || die "static root missing for $app: $root_abs"
  root_abs="$(cd "$root_abs" && pwd)"
  cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON_BIN}</string>
    <string>${SERVE_BIN}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KENOS_STATIC_ROOT</key>
    <string>${root_abs}</string>
    <key>KENOS_STATIC_PORT</key>
    <string>${port}</string>
    <key>KENOS_STATIC_APP</key>
    <string>${app}</string>
    <key>KENOS_STATIC_BIND</key>
    <string>${KENOS_STATIC_BIND:-0.0.0.0}</string>
    <key>KENOS_RELEASE_META</key>
    <string>${META}</string>
    <key>KENOS_LOCALAI_PROXY</key>
    <string>${proxy_flag}</string>
    <key>KENOS_DEVICE_TRUST</key>
    <string>${STATE_DIR}/device-trust.json</string>
    <key>KENOS_LOCALAI_ALLOW_LAN</key>
    <string>${KENOS_LOCALAI_ALLOW_LAN:-0}</string>
    <key>KENOS_LOCALAI_MAX_INFLIGHT</key>
    <string>${KENOS_LOCALAI_MAX_INFLIGHT:-2}</string>
    <key>PATH</key>
    <string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log_out}</string>
  <key>StandardErrorPath</key>
  <string>${log_err}</string>
</dict>
</plist>
PLIST
}

companion_build_root() {
  local app="$1"
  echo "$ROOT/apps/${app}/build"
}

install_companions() {
  local installed=0 skipped=0
  local spec app label port url build
  for spec in "${COMPANION_SPECS[@]}"; do
    IFS=':' read -r app label port url <<<"$spec"
    build="$(companion_build_root "$app")"
    if [[ ! -d "$build" ]]; then
      echo "  skip $app — missing $build (run npm run build -w ${app}-os or app build)"
      skipped=$((skipped + 1))
      continue
    fi
    write_plist "$label" "$app" "$port" "$build"
    kill_port_holders "$port"
    boot_agent "$label"
    echo "  companion $app → :$port ($build)"
    installed=$((installed + 1))
  done
  echo "✔ Continuity companions: $installed installed, $skipped skipped"
}

boot_agent() {
  local label="$1"
  local plist="$HOME/Library/LaunchAgents/${label}.plist"
  launchctl bootout "$GUI/$label" 2>/dev/null || true
  launchctl bootstrap "$GUI" "$plist"
  launchctl enable "$GUI/$label" 2>/dev/null || true
  launchctl kickstart -k "$GUI/$label" 2>/dev/null || true
}

kill_port_holders() {
  local port="$1"
  local pids
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
  fi
}

cmd_build() {
  local sha
  sha="$(git -C "$ROOT" rev-parse HEAD)"
  local short="${sha:0:12}"
  local stamp
  stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local dest="$RELEASES/${short}"
  echo "→ Building Personal Daily Beta @ $short"

  # Free Continuity ports from leftover vite/preview before we claim them
  kill_port_holders "$PLANNER_PORT"
  kill_port_holders "$FITNESS_PORT"
  # Keep 5219 free for aios daily beta
  kill_port_holders "$AIOS_PORT"

  (
    cd "$ROOT"
    echo "  building aios-os (local daily beta origins)…"
    VITE_KENOS_LOCAL_DAILY_BETA=1 VITE_AIOS_CLOUD=0 \
      npm run build -w aios-os
    echo "  building planner-os (Owner-limited writers + offline queue for Daily Beta)…"
    # Owner cohort: hosted create/lifecycle/title writers + offline intent queue for dogfood.
    OWNER_EMAIL="${KENOS_DAILY_BETA_OWNER_EMAIL:-334452284ken@gmail.com}"
    VITE_KENOS_CONTINUE_ORIGIN="$AIOS_URL" \
      VITE_KENOS_PROD_WRITES=1 \
      VITE_KENOS_PLAN_CREATE_TASK_WRITER=1 \
      VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_COMPLETE_TASK_WRITER=1 \
      VITE_KENOS_PLAN_COMPLETE_TASK_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_REOPEN_TASK_WRITER=1 \
      VITE_KENOS_PLAN_REOPEN_TASK_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER=1 \
      VITE_KENOS_PLAN_UPDATE_TASK_TITLE_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER=1 \
      VITE_KENOS_PLAN_UPDATE_TASK_DUE_DATE_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER=1 \
      VITE_KENOS_PLAN_UPDATE_TASK_SCHEDULE_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_UPDATE_TASK_PROJECT_WRITER=1 \
      VITE_KENOS_PLAN_UPDATE_TASK_PROJECT_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER=1 \
      VITE_KENOS_PLAN_ARCHIVE_TASK_WRITER_OWNER_EMAILS="$OWNER_EMAIL" \
      VITE_KENOS_PLAN_OFFLINE_WRITER_QUEUE=1 \
      VITE_KENOS_COMPAT_CANARY=0 \
      VITE_KENOS_READ_CANARY=0 \
      npm run build -w planner-os
    echo "  building fitness-os…"
    VITE_KENOS_CONTINUE_ORIGIN="$AIOS_URL" \
      npm run build -w fitness-os
  )

  rm -rf "$dest"
  mkdir -p "$dest/apps"
  rsync -a --delete "$ROOT/apps/aios/build/" "$dest/apps/aios/build/"
  rsync -a --delete "$ROOT/apps/planner/build/" "$dest/apps/planner/build/"
  rsync -a --delete "$ROOT/apps/fitness/build/" "$dest/apps/fitness/build/"

  cat >"$dest/release.json" <<JSON
{
  "sha": "$sha",
  "shortSha": "$short",
  "builtAt": "$stamp",
  "environment": "local-daily-beta",
  "origins": {
    "aios": "$AIOS_URL",
    "planner": "$PLANNER_URL",
    "fitness": "$FITNESS_URL"
  },
  "flags": {
    "planOfflineWriterQueue": true,
    "planCreateTaskWriter": true,
    "planCompleteReopenWriters": true,
    "planUpdateTaskTitleWriter": true,
    "planUpdateTaskDueDateWriter": true,
    "planUpdateTaskScheduleWriter": true,
    "planUpdateTaskProjectWriter": true,
    "planArchiveTaskWriter": true,
    "prodWrites": true
  }
}
JSON

  if [[ -L "$CURRENT" || -d "$CURRENT" ]]; then
    rm -f "$PREVIOUS"
    cp -R "$CURRENT" "$PREVIOUS" 2>/dev/null || ln -sfn "$(readlink "$CURRENT" 2>/dev/null || echo "$CURRENT")" "$PREVIOUS"
  fi
  rm -rf "$CURRENT"
  ln -sfn "$dest" "$CURRENT"
  echo "✔ Release staged → $CURRENT"
  echo "  SHA $sha"
}

cmd_install() {
  [[ -f "$META" ]] || die "No current release. Run: $0 build"
  [[ -x "$NODE_BIN" || -f "$NODE_BIN" ]] || die "node not found (set KENOS_NODE_BIN)"
  sync_serve_bin
  write_plist "$LABEL_AIOS" aios "$AIOS_PORT" aios
  write_plist "$LABEL_PLANNER" planner "$PLANNER_PORT" planner
  write_plist "$LABEL_FITNESS" fitness "$FITNESS_PORT" fitness
  kill_port_holders "$AIOS_PORT"
  kill_port_holders "$PLANNER_PORT"
  kill_port_holders "$FITNESS_PORT"
  boot_agent "$LABEL_AIOS"
  boot_agent "$LABEL_PLANNER"
  boot_agent "$LABEL_FITNESS"
  echo "✔ Core LaunchAgents installed (RunAtLoad + KeepAlive + kickstart)"
  install_companions
}

cmd_uninstall() {
  local label spec
  for label in "${CORE_LABELS[@]}"; do
    launchctl bootout "$GUI/$label" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/${label}.plist"
  done
  for spec in "${COMPANION_SPECS[@]}"; do
    IFS=':' read -r _ label _ _ <<<"$spec"
    launchctl bootout "$GUI/$label" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/${label}.plist"
  done
  echo "✔ LaunchAgents removed (core + Continuity companions)"
}

ensure_tailnet_pair() {
  # Mac↔iPhone trust via personal Tailnet MagicDNS (LocalAI stays on loopback).
  if [[ "${KENOS_SKIP_TAILNET:-0}" == "1" ]]; then
    echo "  skip Tailscale pair (KENOS_SKIP_TAILNET=1)"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1 && [[ ! -x "$NODE_BIN" && ! -f "$NODE_BIN" ]]; then
    echo "  WARN: node missing — skip Tailscale pair"
    return 0
  fi
  local out
  if out="$("$NODE_BIN" "$CTL_DIR/ensure-tailnet-pair.mjs" --json 2>/dev/null)"; then
    local origin
    origin="$(printf '%s' "$out" | python3 -c "import sys,json; print(json.load(sys.stdin).get('shellOrigin',''))" 2>/dev/null || true)"
    echo "  Tailscale pair OK"
    [[ -n "$origin" ]] && echo "  Phone shell origin: $origin"
  else
    echo "  WARN: Tailscale pair incomplete — open Tailscale on Mac + iPhone (same tailnet)"
  fi
}

cmd_start() {
  if [[ ! -f "$META" ]]; then
    echo "No release yet — building…"
    cmd_build
  fi
  echo "→ Tailnet device pair (Mac ↔ iPhone)"
  ensure_tailnet_pair
  cmd_install
  # wait health (core required; companions best-effort)
  local i core_ok=0
  for i in $(seq 1 40); do
    if http_ok "$AIOS_URL/__health" && http_ok "$PLANNER_URL/__health" && http_ok "$FITNESS_URL/__health"; then
      core_ok=1
      break
    fi
    sleep 0.25
  done
  [[ "$core_ok" -eq 1 ]] || die "core services failed health — see $LOG_DIR and: $0 doctor"
  echo "✔ Daily Beta up"
  echo "  Kenos     $AIOS_URL"
  echo "  Plan      $PLANNER_URL"
  echo "  Training  $FITNESS_URL"
  if http_ok "$AIOS_URL/__localai/v1/models"; then
    echo "  LocalAI   $AIOS_URL/__localai → 127.0.0.1:18888"
  else
    echo "  LocalAI   proxy DOWN (is llama-swap on 127.0.0.1:18888?)"
  fi
  local spec app label port url
  for spec in "${COMPANION_SPECS[@]}"; do
    IFS=':' read -r app label port url <<<"$spec"
    if http_ok "$url/__health"; then
      echo "  $app  $url"
    else
      echo "  $app  DOWN $url (build missing or still starting)"
    fi
  done
  if [[ -f "$STATE_DIR/device-trust.json" ]]; then
    echo "  Trust     $STATE_DIR/device-trust.json"
  fi
}

cmd_stop() {
  local label spec
  for label in "${CORE_LABELS[@]}"; do
    launchctl bootout "$GUI/$label" 2>/dev/null || true
  done
  for spec in "${COMPANION_SPECS[@]}"; do
    IFS=':' read -r _ label _ _ <<<"$spec"
    launchctl bootout "$GUI/$label" 2>/dev/null || true
  done
  # also stop non-launchd leftovers
  pkill -f "kenos-daily-beta/serve-static.mjs" 2>/dev/null || true
  pkill -f "kenos-daily-beta/serve-static.py" 2>/dev/null || true
  echo "✔ Daily Beta stopped (data retained)"
}

cmd_restart() {
  cmd_stop
  sleep 0.5
  cmd_start
}

cmd_status() {
  echo "Kenos Personal Daily Beta"
  if [[ -f "$META" ]]; then
    echo "  release: $(python3 -c "import json;print(json.load(open('$META')).get('shortSha','?'), json.load(open('$META')).get('builtAt',''))" 2>/dev/null || echo present)"
  else
    echo "  release: (none)"
  fi
  local pair name url spec app
  for pair in "aios:$AIOS_URL" "planner:$PLANNER_URL" "fitness:$FITNESS_URL"; do
    name="${pair%%:*}"
    url="${pair#*:}"
    if http_ok "$url/__health"; then
      echo "  $name: UP  $url"
    else
      echo "  $name: DOWN $url"
    fi
  done
  for spec in "${COMPANION_SPECS[@]}"; do
    IFS=':' read -r app _ _ url <<<"$spec"
    if http_ok "$url/__health"; then
      echo "  $app: UP  $url"
    else
      echo "  $app: DOWN $url"
    fi
  done
}

cmd_doctor() {
  local fail=0
  echo "=== kenos-doctor ==="
  cmd_status
  echo "--- ports ---"
  local p
  for p in "$AIOS_PORT" "$PLANNER_PORT" "$FITNESS_PORT" "$FINANCE_PORT" "$KNOWLEDGE_PORT" "$MUSIC_PORT" "$HOME_PORT" "$HEALTH_PORT"; do
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "  :$p LISTEN"
      lsof -nP -iTCP:"$p" -sTCP:LISTEN | awk 'NR==1 || /LISTEN/'
    else
      # Companions are soft-required (need apps/*/build); core ports hard-fail.
      if [[ "$p" == "$AIOS_PORT" || "$p" == "$PLANNER_PORT" || "$p" == "$FITNESS_PORT" ]]; then
        echo "  :$p FREE (expected LISTEN when started)"
        fail=1
      else
        echo "  :$p FREE (companion — start after app build)"
      fi
    fi
  done
  echo "--- release identity ---"
  local url out
  for url in "$AIOS_URL" "$PLANNER_URL" "$FITNESS_URL"; do
    if out="$(curl -sf --max-time 2 "$url/__kenos/release" 2>/dev/null)"; then
      echo "  $url → $out"
    else
      echo "  $url → release meta missing"
      fail=1
    fi
  done
  echo "--- app identity (HTML data-app) ---"
  local pair name html
  for pair in "aios:$AIOS_URL" "planner:$PLANNER_URL" "fitness:$FITNESS_URL"; do
    name="${pair%%:*}"
    url="${pair#*:}"
    html="$(curl -sf --max-time 3 "$url/" 2>/dev/null || true)"
    if echo "$html" | grep -q "data-app=\"$name\""; then
      echo "  $name identity OK"
    elif echo "$html" | grep -q 'data-app='; then
      echo "  $name identity WARN (data-app present but mismatch)"
      fail=1
    else
      echo "  $name identity FAIL"
      fail=1
    fi
  done
  echo "--- Continuity companions ---"
  local spec app label port
  for spec in "${COMPANION_SPECS[@]}"; do
    IFS=':' read -r app label port url <<<"$spec"
    if http_ok "$url/__health"; then
      echo "  $app OK $url"
    else
      echo "  $app DOWN $url"
    fi
  done
  echo "--- Tailscale device pair (Mac ↔ iPhone) ---"
  ensure_tailnet_pair
  if [[ -f "$STATE_DIR/device-trust.json" ]]; then
    python3 - "$STATE_DIR/device-trust.json" <<'PY' 2>/dev/null || echo "  trust file present"
import json, sys
d = json.loads(open(sys.argv[1], encoding="utf-8").read())
mac = (d.get("mac") or {}).get("dns")
phone = (d.get("phone") or {})
print(f"  mac   {mac}")
print(f"  phone {phone.get('dns')} online={phone.get('online')}")
print(f"  shell {((d.get('shell') or {}).get('origin'))}")
PY
  else
    echo "  trust file missing"
    fail=1
  fi
  echo "--- LocalAI same-origin proxy ---"
  echo "  bind=${KENOS_STATIC_BIND:-0.0.0.0} allow_lan=${KENOS_LOCALAI_ALLOW_LAN:-0} max_inflight=${KENOS_LOCALAI_MAX_INFLIGHT:-2}"
  if [[ "${KENOS_LOCALAI_ALLOW_LAN:-0}" == "1" ]]; then
    echo "  WARN: KENOS_LOCALAI_ALLOW_LAN=1 — RFC1918/CGNAT peers can hit /__localai"
  fi
  if [[ -f "$STATE_DIR/device-trust.json" ]]; then
    python3 - "$STATE_DIR/device-trust.json" <<'PY' 2>/dev/null || true
import json, sys
d = json.loads(open(sys.argv[1], encoding="utf-8").read())
mac = (d.get("mac") or {}).get("ipv4")
phone = (d.get("phone") or {}).get("ipv4")
print(f"  allowlist loopback + mac={mac} phone={phone}")
PY
  fi
  if out="$(curl -sf --max-time 3 "$AIOS_URL/__kenos/release" 2>/dev/null)"; then
    echo "  aios release localaiProxy=$(printf '%s' "$out" | python3 -c "import sys,json; print(json.load(sys.stdin).get('localaiProxy'))" 2>/dev/null || echo '?')"
  fi
  if curl -sf --max-time 2 "$AIOS_URL/__health?deep=1" >/dev/null 2>&1; then
    echo "  $AIOS_URL/__health?deep=1 OK"
  else
    echo "  $AIOS_URL/__health?deep=1 FAIL (LocalAI upstream)"
    fail=1
  fi
  if http_ok "$AIOS_URL/__localai/v1/models"; then
    echo "  $AIOS_URL/__localai/v1/models OK"
  else
    echo "  $AIOS_URL/__localai/v1/models FAIL (start LocalAI gateway + restart Daily Beta)"
    fail=1
  fi
  echo "--- companion LocalAI proxy closed ---"
  local companion_leaked=0
  for url in "$PLANNER_URL" "$FITNESS_URL" "$FINANCE_URL" "$MUSIC_URL" "$HOME_URL" "$HEALTH_URL" "$KNOWLEDGE_URL"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url/__localai/v1/models" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" ]]; then
      echo "  LEAK $url/__localai → $code (expected non-200)"
      companion_leaked=1
      fail=1
    else
      echo "  closed $url/__localai → $code"
    fi
  done
  if [[ "$companion_leaked" -eq 0 ]]; then
    echo "  companions OK (no /__localai 200)"
  fi
  echo "--- LocalAI phone smoke (MagicDNS /__localai chat) ---"
  if out="$("$NODE_BIN" "$CTL_DIR/localai-phone-smoke.mjs" --recover --json 2>/dev/null)"; then
    echo "  phone smoke PASS"
    printf '%s' "$out" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  origin', d.get('origin')); print('  checks', ', '.join(f\"{c['name']}={'ok' if c['ok'] else 'FAIL'}\" for c in d.get('checks',[])))" 2>/dev/null || true
  else
    echo "  phone smoke FAIL (see $STATE_DIR/localai-phone-smoke-latest.json)"
    fail=1
  fi
  echo "--- auth bootstrap (public supabase reachability) ---"
  if curl -sf --max-time 5 "https://iueozzuctstwvzbcxcyh.supabase.co/auth/v1/health" >/dev/null 2>&1 \
    || curl -sf --max-time 5 "https://iueozzuctstwvzbcxcyh.supabase.co/" >/dev/null 2>&1; then
    echo "  supabase reachable"
  else
    echo "  supabase reachability WARN (network)"
  fi
  echo "--- rollback target ---"
  if [[ -e "$PREVIOUS" ]]; then
    echo "  previous release present → $PREVIOUS"
  else
    echo "  previous release: none yet (first build)"
  fi
  echo "--- recent logs ---"
  ls -lt "$LOG_DIR" 2>/dev/null | head -6 || echo "  (no logs)"
  if [[ "$fail" -ne 0 ]]; then
    echo "DOCTOR: FAIL"
    return 2
  fi
  echo "DOCTOR: PASS"
}

cmd_rollback() {
  [[ -e "$PREVIOUS" ]] || die "No previous release to roll back to"
  echo "→ Stopping current services"
  cmd_stop
  local tmp="$STATE_DIR/_swap_current"
  rm -rf "$tmp"
  if [[ -L "$CURRENT" ]]; then
    cur_target="$(readlink "$CURRENT")"
    prev_target="$(readlink "$PREVIOUS" 2>/dev/null || echo "$PREVIOUS")"
    rm -f "$CURRENT"
    ln -sfn "$prev_target" "$CURRENT"
    rm -f "$PREVIOUS"
    ln -sfn "$cur_target" "$PREVIOUS"
  else
    mv "$CURRENT" "$tmp"
    mv "$PREVIOUS" "$CURRENT"
    mv "$tmp" "$PREVIOUS"
  fi
  echo "→ Starting previous release"
  cmd_start
  echo "✔ Rolled back. Use '$0 rollback' again to restore the newer build."
}

cmd_open() {
  cmd_start
  open -na "Google Chrome" --args --app="$AIOS_URL/"
}

cmd_snapshot() {
  local snap="$STATE_DIR/snapshots/snap-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$snap"
  if [[ -f "$META" ]]; then cp "$META" "$snap/release.json"; fi
  # Non-sensitive: ports + SHA only. Do not copy localStorage dumps with tokens.
  cat >"$snap/README.md" <<EOF
# Pre-release snapshot

- time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- current release meta copied if present
- DB: shared Supabase (no dump). Rollback does not delete cloud rows.
- Local Continue state lives in browser origin localStorage for $AIOS_URL
EOF
  echo "✔ Snapshot note → $snap"
}

usage() {
  cat <<EOF
kenos-ctl.sh — Kenos Personal Daily Beta

  build      Build aios+planner+fitness into ~/.kenos-daily-beta/releases/<sha>
  install    Install user LaunchAgents (core + Continuity companions)
  uninstall  Remove LaunchAgents
  start      Ensure release + start services
  stop       Stop services (keep data)
  restart    Stop + start
  status     Health summary (core + money/library/music/home/health)
  doctor     Deep health + identity + rollback target
  rollback   Swap to previous release and start
  open       start + open Kenos Chrome app window
  snapshot   Write pre-release safety note

Core:       $AIOS_URL / $PLANNER_URL / $FITNESS_URL
Companions: finance:$FINANCE_PORT knowledge:$KNOWLEDGE_PORT music:$MUSIC_PORT home:$HOME_PORT health:$HEALTH_PORT
            (serve apps/<id>/build on 0.0.0.0 when build/ exists)
Daily entry: $AIOS_URL/
EOF
}

case "${1:-}" in
  build) cmd_build ;;
  install) cmd_install ;;
  uninstall) cmd_uninstall ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  status) cmd_status ;;
  doctor) cmd_doctor ;;
  rollback) cmd_rollback ;;
  open) cmd_open ;;
  snapshot) cmd_snapshot ;;
  ""|-h|--help) usage ;;
  *) die "unknown command: $1" ;;
esac
