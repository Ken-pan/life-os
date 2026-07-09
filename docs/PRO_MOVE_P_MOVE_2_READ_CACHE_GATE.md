# PaperOS P-MOVE-2 Read Cache Gate

**Date:** 2026-07-09  
**Device:** reMarkable Paper Pro Move (`imx93-chiappa`)  
**Status:** partial pass; binary rebuild pending

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

## Remaining Gate

The updated source still needs a reMarkable Paper Pro Move Qt6 SDK build:

```bash
cd apps/planner-device/remarkable-lite
./scripts/build-remarkable.sh
scp build-docker/paperos remarkable-pro-move:/home/root/paperos/paperos
ssh remarkable-pro-move 'chmod 755 /home/root/paperos/paperos'
```

This repo does not contain the official SDK installer under
`apps/planner-device/remarkable-lite/docker/sdk-installer/`, and this local Mac
environment does not have `cmake`, so the binary rebuild was not completed in
this gate.

## Next Verification

After deploying the rebuilt binary:

1. Run `/home/root/paperos/refresh-cache.sh`.
2. Start `/home/root/paperos/open-paperos.sh`.
3. Disable networking or make the API unreachable.
4. Start PaperOS again and confirm it renders the cached Today view with the
   previous `last_sync.txt`.
5. Run `/home/root/paperos/recover-xochitl.sh` and confirm xochitl is `active`.
