# reMarkable Paper Pro Move Device Access Verification

This document captures the verification status of the hardware target connectivity.

## Device Details
* **Device Hostname**: `imx93-chiappa`
* **OS Version**: `5.7.126 (scarthgap)`
* **Connectivity Alias**: `ssh remarkable-pro-move`

## Disk Layout Verification
* **Root Partition (`/`)**: Only ~88M free. Do not write binaries, workspace files, or logs to `/`.
* **Home Partition (`/home`)**: ~45.8G free. Writable and safe for experiments.

## Setup Workspace
A safe legacy workspace has been prepared on the device:
* **Path**: `/home/root/planneros-lite`
* **README**: `/home/root/planneros-lite/DEVICE_README.txt`
* **Access Mode**: Restricted permissions (`chmod 700`)

## PaperOS Rename Status

`/home/root/planneros-lite` is the verified legacy workspace from the earlier
successful setup. The canonical PaperOS target path is now:

* **Path**: `/home/root/paperos`
* **Reason**: PaperOS is the device OS/app shell name; Planner is the first data
  provider, not the device product name.

Current status: `/home/root/paperos` is deployed as the canonical PaperOS
workspace. The old `/home/root/planneros-lite` directory remains as a rollback
source.

## Latest Live SSH Check

* **2026-07-09**: `ssh remarkable-pro-move` reached `imx93-chiappa` again.
  `/home/root/planneros-lite` was confirmed as the legacy workspace and
  `/home/root/paperos` is now the canonical PaperOS workspace.
* **2026-07-09**: `open-paperos.sh` launched `/home/root/paperos/paperos`
  with xochitl inactive, and `recover-xochitl.sh` restored xochitl to
  `active`. See [`PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md`](./PRO_MOVE_P_MOVE_1_DEVICE_SESSION_GATE.md).
* **2026-07-09 (P-MOVE-3/4)**: CJK font + pagination binary and the
  `paperos.service` launcher were deployed and verified live. Crash
  (`kill -9`) auto-recovery to xochitl confirmed. See
  [`PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md`](./PRO_MOVE_P_MOVE_4_EXIT_RECOVERY_LAUNCHER_GATE.md).

## Connectivity Notes

* The device suspends after idle and drops the USB network; SSH then fails
  with "No route to host" / timeouts. Wake the device (power button) before
  deploying. Verify with `ping -c 1 10.11.99.1`.
* USB is the default deploy channel; Wi-Fi SSH stays off unless explicitly
  needed.

## Current Device Workspace (2026-07-09)

```text
/home/root/paperos/
  paperos              # Qt Quick app (CJK + pagination + Exit), sha256 8992df6a…
  paperos.backup-*     # rollback binaries from each promotion
  paperos.service      # launcher unit (linked into /etc/systemd/system)
  open-paperos.sh      # shell launcher with recovery trap + exit-code log
  recover-xochitl.sh   # manual recovery (kills paperos*, restores xochitl)
  refresh-cache.sh     # sidecar cache refresh (wget + token)
  config.json / token  # mode 600, never committed
  cache.json / last_sync.txt
  fonts/NotoSansCJKsc-Regular.otf
```
