---
title: KENOS APPLE CLIENTS — PACKAGE STATUS
owner: kenpan
last_verified: 2026-07-20
status: DEVICE_OWNER_OPEN_ATTESTED
---

# Apple clients progress

## Automated

| Check | Result |
| --- | --- |
| KenosContracts `swift test` | PASS (6) |
| KenosClient `swift test` | PASS (6) |
| KenosIOS simulator build | BUILD SUCCEEDED |
| KenosMac arm64 build | completed |
| KenosIOS device build (`Ken’s 17 Pro`) | **BUILD SUCCEEDED** (team `93NJ4CAU8B`) |
| Device install | **PASS** — `space.kenos.app.ios` |
| Device cold-launch via `devicectl` | intermittently Locked (remote) |
| Owner attestation「真机已开」 | **PASS** — 2026-07-20 |

## Production verdict (this gate)

- Install + Owner-opened on physical iPhone 17 Pro: **PASS**
- Full Focus/Approval/cross-device matrix: still optional follow-up evidence
- Simulator ≠ substitute for this gate

## Next Apple

Optional deeper smoke (Focus start/end, Approvals list) when Owner has spare minute; not blocking Capture convert / Legacy pre-revoke.
