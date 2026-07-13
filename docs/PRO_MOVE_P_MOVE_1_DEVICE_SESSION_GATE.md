# PAPR.DEV.1 Device Session Gate

Date: 2026-07-09

Device: reMarkable Paper Pro Move (`imx93-chiappa`)

## Result

PASS for the home-only PaperOS launcher baseline.

PaperOS is deployed under `/home/root/paperos` without modifying `/usr`,
`/etc`, xochitl internals, or boot behavior. The legacy workspace
`/home/root/planneros-lite` remains intact as a rollback source.

## Device Evidence

```text
hostname: imx93-chiappa
kernel: Linux imx93-chiappa 6.12.49+git-imx93-chiappa-g68b95e858a0a aarch64
xochitl before deploy: active
legacy workspace: /home/root/planneros-lite
canonical workspace: /home/root/paperos
```

Migrated runtime artifact:

```text
231f033c65ad25098b9e81b2b129ba9b2c1eb4974e46595369cd3a9846b1cbf8  /home/root/paperos/paperos
231f033c65ad25098b9e81b2b129ba9b2c1eb4974e46595369cd3a9846b1cbf8  /home/root/planneros-lite/planneros-lite
```

Device layout after deploy:

```text
/home/root/paperos/
  config.example.json
  config.json
  open-paperos.sh
  paperos
  recover-xochitl.sh
  refresh-cache.sh
```

## Session Test

Command path:

```text
/home/root/paperos/open-paperos.sh
```

Observed state:

```text
xochitl_during=inactive
/home/root/paperos/paperos -platform epaper
```

PaperOS initialized the epaper Qt backend:

```text
rm.epaperevdevtouchscreenhandler: screenGeometry QRect(0,0 954x1696)
qml: Screen diagnostics: 954 x 1696 pixelDensity: 10.393700787401576
```

Recovery path:

```text
/home/root/paperos/recover-xochitl.sh
xochitl_after=active
```

## Notes

- `/home/root/paperos/token` is not present yet, so `refresh-cache.sh` fails
  closed and cannot pull real `/api/paper/today` data yet.
- The warning `systemctl daemon-reload` appeared when starting xochitl, but no
  PaperOS step wrote systemd units or modified `/etc`; the warning predates
  this home-only deployment path.
- PAPR.DEV.1 intentionally does not install a service, timer, xochitl patch, or
  boot replacement.

## Next Gate

PAPR.DEV.2 should add a device token and verify:

- `/home/root/paperos/refresh-cache.sh` writes `cache.json`.
- PaperOS renders the last-good cache when offline.
- Missing or invalid token remains a local visible error instead of enabling
  unsafe writes.
