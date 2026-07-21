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

AIOS_URL="http://127.0.0.1:${AIOS_PORT}"
PLANNER_URL="http://127.0.0.1:${PLANNER_PORT}"
FITNESS_URL="http://127.0.0.1:${FITNESS_PORT}"

LABEL_AIOS="com.kenpan.kenos-daily-beta.aios"
LABEL_PLANNER="com.kenpan.kenos-daily-beta.planner"
LABEL_FITNESS="com.kenpan.kenos-daily-beta.fitness"

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
  chmod +x "$SERVE_BIN"
}

write_plist() {
  local label="$1" app="$2" port="$3" build_rel="$4"
  local plist="$HOME/Library/LaunchAgents/${label}.plist"
  local root_abs="$CURRENT/apps/${build_rel}/build"
  local log_out="$LOG_DIR/${app}.stdout.log"
  local log_err="$LOG_DIR/${app}.stderr.log"
  # Resolve symlink so launchd does not depend on live symlink races
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
    echo "  building planner-os…"
    VITE_KENOS_CONTINUE_ORIGIN="$AIOS_URL" \
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
  echo "✔ LaunchAgents installed (RunAtLoad + KeepAlive + kickstart)"
}

cmd_uninstall() {
  for label in "$LABEL_AIOS" "$LABEL_PLANNER" "$LABEL_FITNESS"; do
    launchctl bootout "$GUI/$label" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/${label}.plist"
  done
  echo "✔ LaunchAgents removed"
}

cmd_start() {
  if [[ ! -f "$META" ]]; then
    echo "No release yet — building…"
    cmd_build
  fi
  cmd_install
  # wait health
  for i in $(seq 1 40); do
    if http_ok "$AIOS_URL/__health" && http_ok "$PLANNER_URL/__health" && http_ok "$FITNESS_URL/__health"; then
      echo "✔ Daily Beta up"
      echo "  Kenos  $AIOS_URL"
      echo "  Plan   $PLANNER_URL"
      echo "  Fit    $FITNESS_URL"
      return 0
    fi
    sleep 0.25
  done
  die "services failed health — see $LOG_DIR and: $0 doctor"
}

cmd_stop() {
  for label in "$LABEL_AIOS" "$LABEL_PLANNER" "$LABEL_FITNESS"; do
    launchctl bootout "$GUI/$label" 2>/dev/null || true
  done
  # also stop non-launchd leftovers
  pkill -f "kenos-daily-beta/serve-static.mjs" 2>/dev/null || true
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
  for pair in "aios:$AIOS_URL" "planner:$PLANNER_URL" "fitness:$FITNESS_URL"; do
    name="${pair%%:*}"
    url="${pair#*:}"
    if http_ok "$url/__health"; then
      echo "  $name: UP  $url"
    else
      echo "  $name: DOWN $url"
    fi
  done
}

cmd_doctor() {
  local fail=0
  echo "=== kenos-doctor ==="
  cmd_status
  echo "--- ports ---"
  for p in "$AIOS_PORT" "$PLANNER_PORT" "$FITNESS_PORT"; do
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "  :$p LISTEN"
      lsof -nP -iTCP:"$p" -sTCP:LISTEN | awk 'NR==1 || /LISTEN/'
    else
      echo "  :$p FREE (expected LISTEN when started)"
      fail=1
    fi
  done
  echo "--- release identity ---"
  for url in "$AIOS_URL" "$PLANNER_URL" "$FITNESS_URL"; do
    if out="$(curl -sf --max-time 2 "$url/__kenos/release" 2>/dev/null)"; then
      echo "  $url → $out"
    else
      echo "  $url → release meta missing"
      fail=1
    fi
  done
  echo "--- app identity (HTML data-app) ---"
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
  install    Install user LaunchAgents (login auto-start)
  uninstall  Remove LaunchAgents
  start      Ensure release + start services
  stop       Stop services (keep data)
  restart    Stop + start
  status     Health summary
  doctor     Deep health + identity + rollback target
  rollback   Swap to previous release and start
  open       start + open Kenos Chrome app window
  snapshot   Write pre-release safety note

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
