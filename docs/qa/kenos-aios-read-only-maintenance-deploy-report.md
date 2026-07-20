---
title: KENOS AIOS READ-ONLY MAINTENANCE DEPLOY
owner: kenpan
last_verified: 2026-07-20
status: DEPLOYED_OBSERVED_PENDING_OWNER_SMOKE
---

# AIOS Read-only Maintenance Deploy

| Item | Value |
| --- | --- |
| SHA | `3d2d7ec1ca4b7a9a11fbb8bfaee2b892408bad1b` |
| Deploy | `6a5dabd7c64347bbb6baa531` |
| URL | https://aios-kenos.netlify.app |
| Rollback | `6a5d500302c73442caf47132` |
| Writers | fail-closed (READ_CANARY) |
| Focus deferred/suggestions network | disabled (`=0`) to avoid Yellow GET 400 |

Bake: AIOS_CLOUD + READ_CANARY + Focus/Work/Today/Shadow reads; deferred/suggestions Off.

Authorized under Autonomous Production Completion Program (AIOS shared maintenance).
