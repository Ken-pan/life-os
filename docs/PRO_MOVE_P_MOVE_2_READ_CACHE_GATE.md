# PaperOS P-MOVE-2 Read Cache Gate

**Date:** 2026-07-09  
**Device:** reMarkable Paper Pro Move (`imx93-chiappa`)  
**Status:** PASS for read-cache session deployment

## What Passed

- Production Planner endpoint is reachable with the PaperOS device token.
- Netlify production deploy includes the Paper functions.
- `/home/root/paperos/token` exists on the device with mode `600`.
- `/home/root/paperos/config.json` points at:
  - `https://planner.kenos.space`
  - `/home/root/paperos/token`
  - `/home/root/paperos/cache.json`
  - `/home/root/paperos/last_sync.txt`
- `/home/root/paperos/refresh-cache.sh` successfully fetched
  `/api/paper/today` and wrote the cache.
- `/home/root/paperos/cache.json` and `/home/root/paperos/last_sync.txt` were
  updated from production.
- The PaperOS Qt/QML binary was rebuilt with the reMarkable Paper Pro Move SDK
  installer and deployed to `/home/root/paperos/paperos`.
- The deployed binary hash matches the local build artifact:
  `948eb7dd19ab8c4cab19c28659c590538f2c01ffa741b305efe5fea2245258e1`.
- A live PaperOS session started successfully with the `epaper` platform plugin.
- The PaperOS client refreshed `last_sync.txt` to `2026-07-09T23:55:02Z`.
- `recover-xochitl.sh` returned stock xochitl to `active`.

## Current Production Payload

The configured `PAPER_DEVICE_USER_ID` currently returns an empty Planner day:

```json
{
  "tasks": [],
  "inbox": { "count": 0 }
}
```

That means the Move can sync successfully, but the PaperOS today view will be
empty until that user has tasks/focus data available through Planner.

## Source Progress

The historical Qt/QML device source has been restored into:

```text
apps/planner-device/remarkable-lite
```

It has been renamed for PaperOS and wired to:

- load cached dashboard data before network fetch,
- read the bearer token from `/home/root/paperos/token`,
- write successful API responses to `/home/root/paperos/cache.json`,
- update `/home/root/paperos/last_sync.txt`,
- show sync/API status in the footer.

## Build And Deploy Evidence

The source was built with the reMarkable Paper Pro Move Qt6 SDK installer:

```bash
cd apps/planner-device/remarkable-lite
./scripts/build-remarkable.sh
scp build-docker/paperos remarkable-pro-move:/home/root/paperos/paperos
ssh remarkable-pro-move 'chmod 755 /home/root/paperos/paperos'
```

The first build exposed a macOS case-insensitive filesystem conflict between the
`PaperOS/` generated QML module directory and the `paperos` executable. The QML
module URI was changed to `PaperOSApp`; the executable remains `paperos`.

## Verified Session

The rebuilt binary started on device:

```text
xochitl=inactive
/home/root/paperos/paperos -platform epaper
rm.epaperevdevtouchscreenhandler: screenGeometry QRect(0,0 954x1696)
qml: Screen diagnostics: 954 x 1696 pixelDensity: 10.393700787401576
```

After recovery:

```text
xochitl=active
last_sync=2026-07-09T23:55:02Z
cache_bytes=376
```

## Remaining Product Work

- Populate Planner data for the configured `PAPER_DEVICE_USER_ID`, because the
  current production payload is valid but empty.
- Run an explicit offline visual check by starting PaperOS after network/API is
  unavailable and confirming it renders the cached Today view.
- Keep production writes disabled until P-MOVE-3 staging validation passes.
