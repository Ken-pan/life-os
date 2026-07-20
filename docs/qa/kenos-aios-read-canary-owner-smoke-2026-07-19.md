---
title: AIOS Read-Canary Owner Smoke — 2026-07-19
owner: kenpan
status: AIOS_READ_ONLY_CANARY_OWNER_SMOKE_COMPLETE
canary: https://aios-kenos-read-canary.netlify.app
canary_deploy: 6a5d498b21f0e8d264da5f2b
source_tip: 0932c97a0
---

# AIOS Read-Canary Owner Smoke Results

Agent ran against the Owner-authenticated Cursor browser tab on
https://aios-kenos-read-canary.netlify.app (logout → Owner re-login → recheck).
Production AIOS was not redeployed.

## Verdict

**`AIOS_READ_ONLY_CANARY_OWNER_SMOKE_COMPLETE`**

Core online + offline SPA + write fail-closed + logout/re-login **PASS**.
**Yellow (non-blocking):** Focus lacks global nav link (offline return-to-/focus awkward); document title can lag behind CloudGate; `aios_memory_*` local keys not cleared on logout.

---

## 1. Online core

| Step              | Result                       | Evidence                                                                                |
| ----------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| Login             | PASS (pre-existing session)  | Today shell with Owner data                                                             |
| Today             | PASS                         | URL `/`, h1 Today                                                                       |
| Spaces            | PASS                         | URL `/spaces`, h1 Spaces; hosted+external Training both listed; no `each_key_duplicate` |
| Work              | PASS                         | URL `/work`; Context Assistant entry present                                            |
| Context Assistant | PASS (after fix `0932c97a0`) | `/assistant?scope=work`, chip **Scope: Work**                                           |
| Global Assistant  | PASS                         | chip **Scope: All Kenos** after sidebar Assistant                                       |
| Inbox             | PASS                         | unavailable shown as **—**, not 0                                                       |
| Focus             | PASS                         | empty state / local Training Focus shell                                                |

### Spaces extras

| Check                        | Result                            |
| ---------------------------- | --------------------------------- |
| Today → Spaces URL/UI match  | PASS                              |
| Console `each_key_duplicate` | PASS (none)                       |
| Same-name Training cards     | PASS (no crash)                   |
| Back / forward               | PASS (`/`↔`/spaces` URL+h1 match) |
| Refresh on `/spaces`         | PASS (direct load)                |

## 2. Assistant scope

| Surface                  | Chip                                          |
| ------------------------ | --------------------------------------------- |
| Global Assistant         | `Scope: All Kenos` (`data-scope-kind=global`) |
| Work → Context Assistant | `Scope: Work` (`context`)                     |
| Local Training Focus     | `Scope: Training · Push Day`                  |

## 3. Write protection

| Attempt              | Result                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assistant send probe | In-memory UI only; `localStorage aios_chats_v1` **unchanged**; network only local AI gateway `127.0.0.1:18888` (model_read), **no** Supabase `conversations` upsert |
| Start Training Focus | Local Focus shell only; page copy: 不写生产; DB `kenos_focus_contexts=0`                                                                                            |
| Kenos domain rows    | `focus=0 work=0 approvals=0` unchanged                                                                                                                              |
| `aios.conversations` | still **13** rows; `max(updated_at)=1784495383529` unchanged                                                                                                        |

## 4. Offline / Reconnect ×5

Method: CDP `Network.emulateNetworkConditions` + `offline`/`online` events; SPA route changes; **no manual refresh** on reconnect.

| Round | Page             | Offline shell | No Chrome ERR | Banner | Reconnect auto | Kept route                                                      |
| ----- | ---------------- | ------------- | ------------- | ------ | -------------- | --------------------------------------------------------------- |
| 1     | Today            | PASS          | PASS          | PASS   | PASS           | PASS                                                            |
| 2     | Spaces           | PASS          | PASS          | PASS   | PASS           | PASS                                                            |
| 3     | Inbox            | PASS          | PASS          | PASS   | PASS\*         | PASS                                                            |
| 4     | Focus            | PASS          | PASS          | PASS   | PASS           | **Yellow** — no `/focus` in global nav; return landed `/spaces` |
| 5     | Work → Assistant | PASS          | PASS          | PASS   | PASS           | PASS (`/assistant?scope=work`, chip Work)                       |

\* One evaluation context was destroyed mid-reconnect script; subsequent navigate confirmed Inbox online OK.

No Netlify 500 observed. Inbox continues to refuse fake zero counts.

Service Worker: `navigator.serviceWorker.controller === true` on canary.

## 5. Logout / cache isolation

| Check                                          | Result                             |
| ---------------------------------------------- | ---------------------------------- |
| Logout → login wall                            | PASS                               |
| Back / deep link `/` `/focus` while logged out | PASS — login wall only             |
| No Today/Work/Inbox data flash                 | PASS                               |
| `aios_chats_v1` cleared                        | PASS (`null`)                      |
| Scope chip gone                                | PASS                               |
| Context not inherited                          | PASS (logged out)                  |
| No new `aios.conversations`                    | PASS                               |
| `aios_memory_*` keys remain                    | **Yellow** — not cleared on logout |
| Title may still say prior route under gate     | **Yellow** cosmetic                |
| Login again                                    | **PASS** (Owner re-authenticated)  |

## 5b. Re-login recheck (after Owner「已重新登录」)

| Check                               | Result                                        |
| ----------------------------------- | --------------------------------------------- |
| Login wall gone; Today data visible | PASS (`/`, h1 Today)                          |
| Refresh Today                       | PASS                                          |
| `aios_chats_v1` after re-login      | empty (0)                                     |
| Global Assistant chip               | **Scope: All Kenos**                          |
| Work page scope hint                | **Scope: Work**                               |
| Work → Context Assistant            | `/assistant?scope=work`, chip **Scope: Work** |
| Sidebar Assistant clears to Global  | **Scope: All Kenos**                          |
| `aios.conversations`                | still 13 / `max_updated` unchanged            |

## 6. Production / pause unchanged

- AIOS prod published still `6a5c617ee8396b00089a6d2e`
- Seven sites `stop_builds=true`
- Canary redeployed with scope fix: `6a5d498b21f0e8d264da5f2b`

## 7. Next

```text
APPROVE_KENOS_AIOS_PRODUCTION_READ_ONLY_REDEPLOY
```
