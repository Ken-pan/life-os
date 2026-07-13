# P-MOVE-6 — Safe Cache and Sync States Gate

**Status:** IMPLEMENTED — device gate pending  
**Date:** 2026-07-11  
**Scope:** PaperOS cache safety, explicit sync states, and an opt-in scheduled
cache refresh. No Paper API, xochitl document store, scheduling UI, or device
deployment changes.

## Implementation

- `refresh-cache.sh` writes a downloaded dashboard and timestamp to adjacent
  temporary files, validates the expected dashboard object (`today`), then
  atomically renames both into place. Download, HTTP, empty, HTML, and invalid
  dashboard responses leave `cache.json` and `last_sync.txt` unchanged.
- `ApiClient` uses atomic `QSaveFile` commits, accepts only a dashboard object
  containing `today`, and keeps the last loaded dashboard after a transient,
  malformed, authentication, or persistence failure.
- System and quick-settings sync labels expose exactly five states:
  `idle`, `syncing`, `current`, `stale`, and `failure`. A cache is stale after
  60 minutes. Failure text identifies whether the retained cache is current or
  stale.
- `paperos-cache-refresh.service` runs only `refresh-cache.sh`; its paired
  timer runs every 30 minutes after a five-minute boot delay. Neither unit
  starts PaperOS, stops xochitl, or touches xochitl's document store.

## Default and Operator Controls

`deploy-paperos.sh` copies and links the service/timer but deliberately does
**not** enable it. After a physical-device gate passes, opt in with:

```sh
ssh remarkable-pro-move 'systemctl enable --now paperos-cache-refresh.timer && systemctl list-timers paperos-cache-refresh.timer'
```

One-command rollback removes the enablement and linked units:

```sh
ssh remarkable-pro-move 'systemctl disable --now paperos-cache-refresh.timer; rm -f /etc/systemd/system/paperos-cache-refresh.timer /etc/systemd/system/paperos-cache-refresh.service; systemctl daemon-reload'
```

## Local Verification

```sh
sh apps/planner/paper-device/tests/test-refresh-cache.sh
```

The test stubs `wget` and verifies successful replacement plus old-cache
retention for download failure and invalid/HTML payloads. It never reads or
prints a real token.

## Device Gate Checklist

- [ ] Cross-build `paperos` with `apps/planner-device/remarkable-lite/scripts/build-remarkable.sh` (**currently blocked:** the required reMarkable SDK installer is not present in `docker/sdk-installer/`).
- [ ] Deploy through the existing PaperOS device procedure; do not enable the
  timer yet.
- [ ] With a valid cache, open System and verify `current`; age
  `last_sync.txt` past 60 minutes and verify `stale`.
- [ ] Tap Sync now and observe `syncing` followed by `current`.
- [ ] Disable network or use an unreachable endpoint; verify `failure` while
  the previous dashboard remains visible, then restore configuration.
- [ ] Enable the timer explicitly; verify it invokes only `refresh-cache.sh`,
  updates a valid cache, and leaves stock xochitl as the boot owner.
- [ ] Run the rollback command, reboot, and verify timer absence plus normal
  xochitl boot.
- [ ] Record cold-start time, page-flip latency, and RSS in this gate before
  marking the device gate PASS.
