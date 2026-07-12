# PaperOS Device Operations

Canonical SSH, storage, deployment and recovery notes for the reMarkable Paper
Pro Move target. Product status belongs in
[`../roadmap/apps/paperos.md`](../roadmap/apps/paperos.md).

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

* **2026-07-12 (PAPR.UI.DEVICE-GATE)**: clean PR binaries were built and
  promoted from their exact remote commits, never from checkpoint binaries:
  * PR #27 `cc122d308bbe` → shell SHA-256
    `599c9525d3b4b3556eb01c4f5ce84eeb1947b91c73d545f334b8913462d6dd89`;
  * PR #28 `3fa85277a3c9` → shell SHA-256
    `2e36f6ce84398d694e986331d4cda94e498739811a5486aafe73250b3c68b47e`.
  Both deployed hashes matched locally built binaries. Each normal exit restored
  `xochitl=active` and `rm-sync=active`. Product verdicts remain BLOCKED; see
  [`../qa/paperos/ui-spec.md`](../qa/paperos/ui-spec.md) §4.8 and §5.9.
* **2026-07-09**: `ssh remarkable-pro-move` reached `imx93-chiappa` again.
  `/home/root/planneros-lite` was confirmed as the legacy workspace and
  `/home/root/paperos` is now the canonical PaperOS workspace.
* **2026-07-09**: `open-paperos.sh` launched `/home/root/paperos/paperos`
  with xochitl inactive, and `recover-xochitl.sh` restored xochitl to
  `active`. See [`../archive/paperos/milestones-2026-07.md`](../archive/paperos/milestones-2026-07.md).
* **2026-07-09 (PAPR.DEV.3/4)**: CJK font + pagination binary and the
  `paperos.service` launcher were deployed and verified live. Crash
  (`kill -9`) auto-recovery to xochitl confirmed. See
  [`../archive/paperos/milestones-2026-07.md`](../archive/paperos/milestones-2026-07.md).

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

## Safe session workflow

1. Wake the device and confirm USB reachability before deployment.
2. Verify Xochitl is active and no stale `paperos*` or `paperos-ink-*` process
   owns input/display.
3. Deploy only under `/home/root/paperos`; keep token and config mode `600`.
4. Enter through the supervised launcher or `paperctl`, never a bare binary
   for a release gate.
5. Exit normally, then verify both `xochitl` and `rm-sync` are active.

If a session fails, kill every PaperOS candidate, remove stale test locks,
run `/home/root/paperos/recover-xochitl.sh`, and verify Xochitl before another
attempt. After an OS reboot or upgrade, the volatile `/etc` overlay may require
re-linking `/home/root/paperos/paperos.service` followed by
`systemctl daemon-reload`.

Never print or commit the device token, write large artifacts to `/`, patch
Xochitl, or enable production writes as part of a device UI test.
