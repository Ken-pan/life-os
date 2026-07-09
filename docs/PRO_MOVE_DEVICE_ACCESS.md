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
