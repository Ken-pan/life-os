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
