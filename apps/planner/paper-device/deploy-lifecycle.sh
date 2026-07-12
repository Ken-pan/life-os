#!/bin/sh
# Deploy the PAPR.SYS.1 lifecycle runtime to the device — TEMPORARY, REVERSIBLE.
#
# What this does:   scp scripts to $TARGET/bin, chmod, seed compat.allowed from
#                   the device's current /etc/os-release VERSION_ID (if absent).
# What this NEVER does: systemctl enable, boot hooks, /etc writes, watcher
#                   autostart, launcher-document creation. Persistent
#                   enablement requires a separate Ken device gate.
#
# The launcher UUID is a deliberate manual step (a dedicated "Open PaperOS"
# document must be created on-device first):
#   ssh $DEVICE "echo <uuid> > /home/root/paperos/launcher.uuid"
#
# Rollback: apps/planner/paper-device/rollback-lifecycle.sh
set -eu

DEVICE="${PAPEROS_DEVICE:-remarkable-pro-move}"
TARGET="${PAPEROS_HOME:-/home/root/paperos}"
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

ssh "$DEVICE" "mkdir -p /tmp/paperos-lifecycle-staging-$$"
scp \
  "$HERE/lifecycle/paperos-lib.sh" \
  "$HERE/lifecycle/paperos-enter" \
  "$HERE/lifecycle/paperos-exit" \
  "$HERE/lifecycle/paperos-recover" \
  "$HERE/lifecycle/paperos-watch" \
  "$HERE/lifecycle/paperos-ctl" \
  "$DEVICE:/tmp/paperos-lifecycle-staging-$$/"

ssh "$DEVICE" "
  set -eu
  mkdir -p '$TARGET/bin' '$TARGET/run'
  mv /tmp/paperos-lifecycle-staging-$$/* '$TARGET/bin/'
  rmdir /tmp/paperos-lifecycle-staging-$$
  chmod 755 '$TARGET/bin/paperos-enter' '$TARGET/bin/paperos-exit' \
            '$TARGET/bin/paperos-recover' '$TARGET/bin/paperos-watch' \
            '$TARGET/bin/paperos-ctl'
  chmod 644 '$TARGET/bin/paperos-lib.sh'
  # Make paperos.service known to systemd so 'systemctl start paperos' works.
  # link != enable: no boot autostart, and the unit has NO [Install] section so
  # it cannot be enabled; /etc is a volatile overlay so the link is gone on
  # reboot anyway. Reversed by rollback (systemctl disable). We LINK the
  # existing unit; we never overwrite it (it is shipped by deploy-paperos.sh).
  if [ -e '$TARGET/paperos.service' ]; then
    systemctl link '$TARGET/paperos.service' 2>/dev/null || true
    systemctl daemon-reload
    echo \"paperos.service LoadState=\$(systemctl show paperos -p LoadState --value)\"
  else
    echo 'WARNING: paperos.service absent — run deploy-paperos.sh first; enter will fail until present'
  fi
  if [ ! -e '$TARGET/compat.allowed' ]; then
    sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '\"' > '$TARGET/compat.allowed'
    echo \"compat.allowed seeded: \$(cat '$TARGET/compat.allowed')\"
  else
    echo \"compat.allowed exists: \$(cat '$TARGET/compat.allowed')\"
  fi
  echo '--- deployed ---'
  ls -la '$TARGET/bin'
  echo \"launcher.uuid: \$([ -r '$TARGET/launcher.uuid' ] && cat '$TARGET/launcher.uuid' || echo 'MISSING (watcher will fail closed until set)')\"
  echo \"xochitl=\$(systemctl is-active xochitl || true) rm-sync=\$(systemctl is-active rm-sync || true)\"
"

cat <<EOF

Deployed (temporary, reversible). Nothing was enabled or auto-started.

Next steps (manual, in order):
  1. Create the dedicated "Open PaperOS" document on the device, find its UUID
     under ~/.local/share/remarkable/xochitl/, then:
       ssh $DEVICE "echo <uuid> > $TARGET/launcher.uuid"
  2. Baseline:   ssh $DEVICE $TARGET/bin/paperos-ctl status
  3. Start the watcher MANUALLY in a foreground SSH session (no systemd):
       ssh $DEVICE $TARGET/bin/paperos-watch
  4. Run the Ken physical gate matrix (see
     docs/qa/paperos-device-lifecycle-sys1-implementation.md).

Rollback (one command):
  apps/planner/paper-device/rollback-lifecycle.sh
EOF
