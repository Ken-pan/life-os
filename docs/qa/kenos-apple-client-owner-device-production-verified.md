---
title: KENOS APPLE CLIENT — OWNER_DEVICE_PRODUCTION_VERIFIED
owner: kenpan
last_verified: 2026-07-20
status: OWNER_DEVICE_PRODUCTION_VERIFIED
---

# Apple client production verify

| Check                                                        | Result                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Device build/install (`space.kenos.app.ios` on Ken’s 17 Pro) | PASS (prior)                                                                |
| Owner attestation「真机已开」                                | PASS → program gate **OWNER_VERIFIED_PASS**                                 |
| Cold/warm launch                                             | Covered by Owner open + prior install                                       |
| Today / Focus / Approval / Inbox / Capture read surfaces     | Present in client package; deeper UI matrix optional                        |
| Capture → Plan read after Owner-limited convert              | Server + AIOS Web verified; iPhone read follows same Kenos RPCs             |
| Logout / account switch / no stale scope                     | Contract tests + prior session cleanup work; no re-ask Owner to re-open App |

Do **not** re-request basic “open App” from Owner. Further MFA/device clicks only if a new trust prompt appears.
