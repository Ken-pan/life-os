#!/bin/sh
# Deploy the PAPR.SYS.1 lifecycle runtime to the device — TEMPORARY, REVERSIBLE,
# SESSION-SCOPED (Manual Mode). Everything lives under $TARGET (/home/root/paperos).
#
# What this does:
#   1. scp the lifecycle scripts to $TARGET/bin (chmod)
#   2. ship the HARDENED unit repo paperos.service -> $TARGET/systemd/paperos.service
#   3. systemctl link $TARGET/systemd/paperos.service  (link != enable) + daemon-reload
#   4. VERIFY the effective unit carries the conditional restart-intent ExecStopPost;
#      fail closed (non-zero) if it is stale/incorrect — the caller must NOT enter PaperOS
#   5. seed compat.allowed from the device's current VERSION_ID (if absent)
#
# What this NEVER does: write to /usr, remount /, systemctl enable, change the
# boot target, stop xochitl, assume /etc persistence, or create the launcher
# document. The /etc link is per-boot (tmpfs overlay) — after a reboot xochitl
# starts normally and the owner must re-run deploy + arm for the new session.
# Persistent enablement (PAPR.SYS.1p) is a separate, deferred gate.
#
# Idempotent: re-running produces the same end state.
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

STAGING="/tmp/paperos-lifecycle-staging-$$"
ssh "$DEVICE" "mkdir -p '$STAGING'"
scp \
  "$HERE/lifecycle/paperos-lib.sh" \
  "$HERE/lifecycle/paperos-enter" \
  "$HERE/lifecycle/paperos-exit" \
  "$HERE/lifecycle/paperos-recover" \
  "$HERE/lifecycle/paperos-watch" \
  "$HERE/lifecycle/paperos-ctl" \
  "$HERE/paperos.service" \
  "$DEVICE:$STAGING/"

ssh "$DEVICE" "
  set -eu
  mkdir -p '$TARGET/bin' '$TARGET/run' '$TARGET/systemd'
  # The hardened session unit ships under /home (NOT /usr): deploy-lifecycle owns
  # \$TARGET/systemd/paperos.service; it never touches the deploy-paperos.sh copy.
  mv '$STAGING/paperos.service' '$TARGET/systemd/paperos.service'
  chmod 644 '$TARGET/systemd/paperos.service'
  mv '$STAGING'/* '$TARGET/bin/'
  rmdir '$STAGING'
  chmod 755 '$TARGET/bin/paperos-enter' '$TARGET/bin/paperos-exit' \
            '$TARGET/bin/paperos-recover' '$TARGET/bin/paperos-watch' \
            '$TARGET/bin/paperos-ctl'
  chmod 644 '$TARGET/bin/paperos-lib.sh'

  # Link the hardened unit for THIS boot. link != enable (no [Install], no boot
  # autostart); the /etc symlink is on the tmpfs overlay so it is per-boot only.
  # Idempotent: drop any existing link, then link our exact /home path.
  echo '--- linking session unit ($TARGET/systemd/paperos.service) ---'
  # Idempotent relink: drop any prior paperos.service link (advisory — it may not
  # be linked yet), then link our exact /home path. A genuine link failure is
  # surfaced by set -e below; the effective-unit check is the real gate.
  systemctl disable paperos 2>/dev/null || true
  systemctl link '$TARGET/systemd/paperos.service'
  systemctl daemon-reload

  # FAIL CLOSED: the effective unit systemd resolves MUST be the hardened one
  # (conditional restart-intent ExecStopPost). A stale/old effective unit means
  # PaperOS-only restart would bounce xochitl — refuse so the caller does not enter.
  esp=\$(systemctl show paperos.service -p ExecStopPost 2>/dev/null || true)
  case \"\$esp\" in
    *restart-intent*)
      echo 'effective paperos.service ExecStopPost: conditional restart-intent OK' ;;
    *)
      echo 'DEPLOY FAILED: effective paperos.service is stale/incorrect (no restart-intent ExecStopPost) — NOT safe to enter' >&2
      exit 3 ;;
  esac

  if [ ! -e '$TARGET/compat.allowed' ]; then
    sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '\"' > '$TARGET/compat.allowed'
    echo \"compat.allowed seeded: \$(cat '$TARGET/compat.allowed')\"
  else
    echo \"compat.allowed exists: \$(cat '$TARGET/compat.allowed')\"
  fi

  echo '--- deployed ---'
  ls -la '$TARGET/bin'
  echo \"unit=\$(readlink -f /etc/systemd/system/paperos.service 2>/dev/null) LoadState=\$(systemctl show paperos -p LoadState --value)\"
  echo \"launcher.uuid: \$([ -r '$TARGET/launcher.uuid' ] && cat '$TARGET/launcher.uuid' || echo 'MISSING (set before arming the watcher)')\"
  echo \"xochitl=\$(systemctl is-active xochitl || true) rm-sync=\$(systemctl is-active rm-sync || true)\"
"

cat <<EOF

Deployed (temporary, SESSION-scoped, reversible). Nothing was enabled or
auto-started; xochitl was not stopped. The unit link is per-boot (tmpfs /etc).

Next steps (manual, in order):
  1. Create/confirm the dedicated "Open PaperOS" document, then:
       ssh $DEVICE "echo <uuid> > $TARGET/launcher.uuid"
  2. Baseline:   ssh $DEVICE $TARGET/bin/paperos-ctl status
  3. Arm the watcher for THIS boot (foreground SSH session, no systemd):
       ssh $DEVICE $TARGET/bin/paperos-watch
  4. Open the "Open PaperOS" document on the device to enter PaperOS.

After a reboot: xochitl starts normally; re-run deploy-lifecycle.sh + re-arm the
watcher (the /etc link does not persist — this is Manual Mode by design).

Rollback (one command):
  apps/planner/paper-device/rollback-lifecycle.sh
EOF
