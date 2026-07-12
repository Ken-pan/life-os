#!/bin/sh
# Rollback the PAPR.SYS.1 lifecycle runtime — one command, device-side effects
# fully reversed:
#   1. stop the journal watcher (token kill; device has no pkill)
#   2. stop the PaperOS runtime (unit + stray processes)
#   3. remove temporary runtime state ($TARGET/run)
#   4. restore xochitl
#   5. verify xochitl + rm-sync active and PaperOS process count 0
#
# --purge additionally removes $TARGET/bin, compat.allowed, launcher.uuid and
# the DISABLED marker (full uninstall of everything deploy-lifecycle.sh and
# the runtime ever wrote).
#
# The native fallbacks (open-paperos.sh, recover-xochitl.sh, linked
# paperos.service) are untouched — the pre-SYS.1 recovery path stays intact.
set -eu

DEVICE="${PAPEROS_DEVICE:-remarkable-pro-move}"
TARGET="${PAPEROS_HOME:-/home/root/paperos}"
PURGE="${1:-}"

ssh "$DEVICE" "
  set -u
  echo '--- stopping watcher ---'
  for pass in 1 2; do
    for p in \$(ps w | grep '[p]aperos-watch' | awk '{print \$1}'); do
      kill \"\$p\" 2>/dev/null
    done
    for p in \$(ps w | grep '[j]ournalctl -fu xochitl -n 0' | awk '{print \$1}'); do
      kill \"\$p\" 2>/dev/null
    done
    sleep 1
  done
  echo '--- stopping PaperOS runtime ---'
  systemctl stop paperos 2>/dev/null
  for p in \$(ps w | awk '/paperos(\\.[a-z0-9]+)? -platform|\\/paperos(\\.[a-z0-9]+)?( |\$)|paperos-ink-[a-z0-9-]+/ && !/awk/ {print \$1}'); do
    kill \"\$p\" 2>/dev/null
  done
  sleep 1
  for p in \$(ps w | awk '/paperos(\\.[a-z0-9]+)? -platform|\\/paperos(\\.[a-z0-9]+)?( |\$)|paperos-ink-[a-z0-9-]+/ && !/awk/ {print \$1}'); do
    kill -9 \"\$p\" 2>/dev/null
  done
  echo '--- unlinking paperos.service (reverses deploy link; not enable) ---'
  systemctl disable paperos 2>/dev/null || true
  systemctl daemon-reload 2>/dev/null || true
  echo '--- removing temporary runtime state ---'
  rm -rf '$TARGET/run'
  if [ '$PURGE' = '--purge' ]; then
    rm -rf '$TARGET/bin'
    rm -f '$TARGET/compat.allowed' '$TARGET/launcher.uuid' '$TARGET/DISABLED'
    echo 'purged bin/, compat.allowed, launcher.uuid, DISABLED'
  fi
  echo '--- restoring xochitl ---'
  systemctl start xochitl
  sleep 2
  x=\$(systemctl is-active xochitl)
  r=\$(systemctl is-active rm-sync)
  n=\$(ps w | awk '/paperos(\\.[a-z0-9]+)? -platform|\\/paperos(\\.[a-z0-9]+)?( |\$)|paperos-ink-[a-z0-9-]+/ && !/awk/' | grep -c . || true)
  w=\$(ps w | grep -c '[p]aperos-watch' || true)
  echo \"END-STATE xochitl=\$x rm-sync=\$r paperos-procs=\$n watcher-procs=\$w\"
  [ \"\$x\" = active ] && [ \"\$r\" = active ] && [ \"\$n\" = 0 ] && [ \"\$w\" = 0 ]
" && echo "ROLLBACK OK — native shell verified" || {
  echo "ROLLBACK VERIFICATION FAILED — inspect device state manually" >&2
  exit 1
}
