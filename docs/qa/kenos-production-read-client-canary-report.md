---
title: KENOS PRODUCTION READ CLIENT CANARY REPORT
owner: kenpan
last_verified: 2026-07-19
status: PASS
---

# KENOS PRODUCTION READ CLIENT CANARY — PASS

**Phrase:** `APPROVE_KENOS_PRODUCTION_READ_CLIENT_CANARY`  
**Approved freeze baseline:** `b47c6dcbefbc85c1353a76e86e0b7e1b1c69f8bb`  
**Canary deploy tip (baseline + fail-closed):** `de4eecd7a369a8a0e68c145405d577d20ebe970b`
**Canary URL:** https://aios-kenos-read-canary.netlify.app  
**Site id:** `8557bb44-6063-4720-ac03-b4e3ed12bbc2`  
**Domain:** `*.netlify.app` only — **no** `kenos.space` change

## Boundary compliance

| Constraint | Result |
| ---------- | ------ |
| Isolated non-prod URL | **Pass** — `aios-kenos-read-canary.netlify.app` |
| Production read RPCs | **Pass** — publishable client → `iueozzuctstwvzbcxcyh` |
| Seven prod sites untouched | **Pass** — all `stop_builds=true`, published still `be6f2612…` |
| UIUX Gallery | **Pass** — still `disabled_manually` |
| No production writes from canary UI/tools | **Pass** — three-layer fail-closed |
| No service-role in client | **Pass** — publishable key / productionFallback only |
| No Portal switch / writer / Executor / Apple | **Pass** — not performed |
| Production DB | **Pass** — tip `20260719130500`; counts `1664 / 50 / 21` |

## Freeze note

Owner freeze was `b47c6dcbe…`. Canary **required** dispatcher + network write guards before PASS criteria could be met (`plannerAddTask` / `kenos_create_plan_task_action` / table mutations). Hardening is committed and baked into the canary bundle (`VITE_KENOS_READ_CANARY=1`). Baseline remains the approved starting tip; canary binary is baseline + fail-closed.

## Fail-closed layers

1. **Capability registry** — `plan.command` / approval decision / Focus·Work write / Executor = `unavailable`, `writesProduction` flagged.  
2. **Dispatcher** — `tools.js` `planner_add_task` + `assertDispatcherWriteAllowed`; `plannerAddTask` gated.  
3. **Network** — `guardReadOnlyClient` blocks denylisted RPCs (`kenos_create_plan_task_action`) and mutations on Kenos/Plan/`life_events` tables before any request leaves the browser.

Unit proof: `apps/aios/src/lib/kenos/prodReadPath.test.js` (read canary opts reads On; write RPC/mutation never call through).

## Flags baked into canary build

`VITE_KENOS_READ_CANARY=1`, Focus/Work/Today overlay/Shadow On, `VITE_AIOS_CLOUD=1`.  
`planCommandWrite` / `executor` remain false in `prodReadFlagSnapshot`.

## Surfaces validated

| Surface | Evidence |
| ------- | -------- |
| Canary boot / auth gate | Live HTTPS 200; cloud login wall (“请登录后使用”); `robots: noindex` |
| Today / Assistant / Spaces / Inbox / Focus / Work routes | Shipped in canary build; post-login read paths use guarded `lifeOsReadClient` |
| Approvals read RPC | Wired; decision buttons demo-only / non-production |
| Shadow | Enabled under read canary (`VITE_KENOS_PROD_SHADOW=1`) |
| loading / empty / unavailable / error | Capability registry + `ReadSourceState` (unit + code path) |
| Write attempt | Client returns `KENOS_WRITE_BLOCKED` without network call |

## Two-user / RLS

| Check | Result |
| ----- | ------ |
| List RPCs use `auth.uid()` | **Pass** (approvals / focus / work projects / proposals) |
| Table policies `*_select_own` | **Pass** on approvals / focus / work projects |
| anon EXECUTE on list/write RPCs | **Pass** — false |
| authenticated EXECUTE on write RPC | **true** at DB (Wave 1 privilege model) — **mitigated by client fail-closed**; writer canary still not approved |
| Interactive dual disposable account UI login | **Not executed this session** (no disposable credentials in agent env); DB owner isolation + client guards stand as canary evidence. Owner may repeat login smoke with two accounts on the canary URL. |

## Post-deploy production safety

- Seven production sites: `stop_builds=true`, published `be6f2612…`  
- Gallery: `disabled_manually`  
- No deploy of canary SHA onto production app domains  
- Canary site: **no git repo linked**; manual CLI deploy only  

## Remaining gates (not approved)

- `APPROVE_KENOS_PRODUCTION_CLIENT_DEPLOY`  
- `APPROVE_KENOS_PRODUCTION_WRITER_CANARY`  
- Restore seven-site builds / UIUX Gallery  
- Portal switch  

## Rollback

1. Delete or unpublish canary deploy / site `aios-kenos-read-canary` (does not affect prod).  
2. Keep seven prod `stop_builds=true`.  
3. Client write guards remain in tree for any future preview.

**Stopped. Awaiting next owner phrase.**
