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
A safe workspace has been prepared on the device:
* **Path**: `/home/root/planneros-lite`
* **README**: `/home/root/planneros-lite/DEVICE_README.txt`
* **Access Mode**: Restricted permissions (`chmod 700`)

## PaperOS Rename Status

`/home/root/planneros-lite` is the verified legacy workspace from the earlier
successful setup. The canonical PaperOS target path is now:

* **Path**: `/home/root/paperos`
* **Reason**: PaperOS is the device OS/app shell name; Planner is the first data
  provider, not the device product name.

Next live-device step: reconnect SSH, inspect `/home/root/planneros-lite`, then
copy, rename, or symlink it to `/home/root/paperos` without touching `/`, `/usr`,
or `/etc`.

## Latest Live SSH Check

* **2026-07-09**: `ssh remarkable-pro-move` timed out on `10.11.99.1:22` from
  this workstation. This does not invalidate the earlier successful device
  verification; it means the Move must be reconnected or Wi-Fi SSH must be
  reachable before device-side migration can proceed.
