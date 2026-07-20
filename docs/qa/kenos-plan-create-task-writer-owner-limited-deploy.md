---
title: KENOS PLAN CREATE-TASK WRITER OWNER-LIMITED DEPLOY
owner: kenpan
last_verified: 2026-07-20
status: DEPLOYED_OWNER_LIMITED
---

# Plan Create-Task Writer — Owner-Limited Production Deploy

## Deploy

| Item | Value |
| --- | --- |
| SHA | `5650f7dece6b172b500bba2225dc6e0be561a66b` |
| Site | `planneros-ken` |
| Deploy | `6a5da2eaedadacd1b63ad3e5` |
| URL | https://planner.kenos.space |
| Rollback | `6a5d7bd5b9334b8e0f03a902` (compat) or `6a5c617e6e1b41000893a948` |
| Bake | `VITE_KENOS_PROD_WRITES=1` + `VITE_KENOS_PLAN_CREATE_TASK_WRITER=1` + `VITE_KENOS_PLAN_CREATE_TASK_WRITER_OWNER_EMAILS=334452284ken@gmail.com` |
| Other sites | untouched; `stop_builds=true` |

## Cohort

Owner email only. Non-cohort users keep Legacy create.

## Prior canary

`KENOS PLAN CREATE-TASK WRITER CANARY — PASS` (deploy `6a5da1ca…`).

## Owner-limited production create sample

| Field | Value |
| --- | --- |
| Title | `KENOS PLAN WRITER OWNER LIMITED — 2026-07-20T04:25:00Z` |
| Task id | `fb49321b-10d0-4ceb-8c57-f79045b96ff2` |
| Idem count after | 4 (3 canary + 1 owner-limited) |
| Cleanup | tombstoned via Legacy upsert |
| Verdict | `OWNER_LIMITED_CREATE — PASS` |

Observation continues with kill switch retained. Next: Plan Edit Writer track.
