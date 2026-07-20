---
title: KENOS FITNESS TRAINING SPACE READ
owner: kenpan
last_verified: 2026-07-20
status: CODE_READY — FLAG_DEFAULT_OFF
---

# Training Space honest read (Fitness)

## Change

- Flag `VITE_KENOS_PROD_READ_TRAINING` (default Off)
- Source: `public.portal_today_summary.fitness` via `trainingReadSource.core.js`
- UI: `/spaces/training` shows real summary when On; no hardcoded Push Day
- Writers: none (Fitness remains Owner at fitness.kenos.space)

## Portal soft-landing prep

- `packages/sync` `createLifeOsAuth({ landingOrigin })` optional override
- Default still `portal.kenos.space` — no production redirect change

## Next

Bake AIOS with `VITE_KENOS_PROD_READ_TRAINING=1` (Owner canary/prod); Finance Money Space same pattern.
