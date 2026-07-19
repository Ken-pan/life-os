---
title: KENOS AIOS LOGOUT MEMORY HARDENING REPORT
owner: kenpan
last_verified: 2026-07-19
status: KENOS AIOS READ-ONLY CLIENT — FINAL_CANARY_PASS
---

# KENOS AIOS LOGOUT MEMORY HARDENING REPORT

## Status

**`KENOS AIOS READ-ONLY CLIENT — FINAL_CANARY_PASS`**

Production AIOS was **not** redeployed. Canary-only.

---

## 1. Starting / final SHA

| | SHA |
| - | --- |
| Start tip | `c84544463` (Owner Smoke complete docs) |
| Hardening commit | `f87336224` — `fix(aios): clear user memory and reset auth-wall context` |
| Final tip | `f87336224` |

## 2. Commits

1. `f87336224` — `fix(aios): clear user memory and reset auth-wall context`
2. This report doc commit

## 3. `aios_memory_*` inventory

| Key | Create | Read | Write | Shape (redacted) |
| --- | ------ | ---- | ----- | ---------------- |
| `aios_memory_v1` | `memory.svelte.js` persist/seed/dream/merge | `load` / hydrate / settings UI | `persist`, dream, cloud merge | `[{ id, text, vector?, createdAt }]` |
| `aios_memory_seeded_v1` | `seedDefaultMemories` | seed guard | set `'1'` once | flag string |
| `aios_memory_dreamed_at_v1` | `dreamMemories` | interval guard | timestamp ms string | number-as-string |
| `aios_memory_backup_v1` | `dreamMemories` before rewrite | (recovery unused) | full items JSON | same as `aios_memory_v1` |

**Observed pre-logout sample (redacted):** `{ count: 18, fields: [id,text,vector,createdAt], textLen: 82 }` — no user id field in rows; content is free-text user facts.

## 4. Classification

| Key | Class |
| --- | ----- |
| `aios_memory_v1` | **USER_SCOPED_MEMORY** |
| `aios_memory_seeded_v1` | **USER_SCOPED_MEMORY** |
| `aios_memory_dreamed_at_v1` | **USER_SCOPED_CACHE** |
| `aios_memory_backup_v1` | **USER_SCOPED_MEMORY** |
| `aios_chats_v1` / drafts / active | USER_SCOPED_* (already cleared) |
| `aios_daily_suggestions_v1` | USER_SCOPED_CACHE |
| `aios_mcp_servers_v1` | AUTH_SESSION_DERIVED |
| `kenos.focus.v1` | USER_SCOPED_CACHE |
| `aios_gateway_url_v1` | **DEVICE_GENERIC_SETTING** |
| `aios_demo` | DEVICE_GENERIC_SETTING |
| `aiosos_v1` | mixed — strip user fields on logout |

No `UNKNOWN` keys retained.

## 5. Retained device-only keys

- `aios_gateway_url_v1` (verified retained after logout)
- `aiosos_v1.settings`: `theme`, `locale`, `model`, tools/tts/temperature/dailyBrief toggles
- `aios_demo` (if present)

## 6. Cleared user-scoped keys

On logout / account switch / auth-wall boot:

- all `aios_memory_*`
- `aios_chats_v1`, session drafts/active
- `aios_cloud_snapshot_v1`, daily suggestions, agent threads, canvas, daily brief, MCP servers, `kenos.focus.v1`
- `aiosos_v1` user fields: `userProfile`, `location`, `customPrompt` → empty

## 7. Logout behavior

`clearUserScopedSessionState()` from `signOutCloud` + auth `SIGNED_OUT` / user-id change:

- in-memory `M.items` emptied
- Focus + Assistant context reset
- storage sweep fail-closed
- device prefs kept via `stripUserFieldsFromSettings` + `applyDeviceOnlySettings`

**Canary proof:** after logout → `memoryKeys=[]`, `smokeGone=true`, `gateway` kept, `theme=auto`, `profile=""`, `title=Kenos — Sign in`.

## 8. Account-switch behavior

`onAuthStateChange`: if `prevId && nextId && prevId !== nextId` → clear. Unit test proves A memory cannot remain for B after clear. Interactive dual-account UI not available in agent env (**Yellow** for live A→B).

## 9. Auth-wall title behavior

- Constant: `Kenos — Sign in` (`AUTH_WALL_DOCUMENT_TITLE`)
- `+layout` uses it when `gated`
- `CloudGate` also sets `<svelte:head>`
- **Verified:** logout, browser Back, direct `/work` while logged out → title stays `Kenos — Sign in` (no Work/Focus leak)

## 10. Tests / CI

- `npm run test -w aios-os` → **104/104 PASS** (incl. `clientSessionCleanup.core.test.js`)
- `npm run check -w aios-os` → 0 errors
- canary production build → OK
- Phase 1 / 2 / 6 → OK
- `git diff --check` on staged paths → OK

## 11. Canary deploy

| Item | Value |
| ---- | ----- |
| URL | https://aios-kenos-read-canary.netlify.app |
| Deploy ID | `6a5d4bf71702873dee82b865` |
| Source SHA | `f87336224` |
| Mode | `VITE_AIOS_CLOUD=1` + `VITE_KENOS_READ_CANARY=1` + read flags |
| noindex | retained |

## 12. Owner smoke (this canary)

| # | Check | Result |
| - | ----- | ------ |
| 1 | Login | PASS (existing session) |
| 2 | Today | PASS |
| 3 | Global Assistant | **Scope: All Kenos** |
| 4 | Work Context Assistant | **Scope: Work** |
| 5 | `aios_memory_*` present while authed | PASS (4 keys; shape redacted) |
| 6 | Logout | PASS |
| 7 | user memory cleared | PASS (`[]`) |
| 8 | device setting retained | PASS (gateway + theme) |
| 9 | title = Kenos — Sign in | PASS |
| 10 | Back | PASS (title + wall, no leak) |
| 11 | Refresh / direct `/work` | PASS (title Sign in) |
| 12–13 | Login again / no residue | **Owner to confirm after re-login** (wall left unlocked) |
| 14 | conversations count | **13** unchanged (`max` unchanged) |
| 15 | Kenos domain writes | focus=0 work=0 |

## 13. Conversation row count

| | Value |
| - | ----- |
| Before | 13 / max `1784495383529` |
| After | 13 / max `1784495383529` |

OWNER SMOKE row **not deleted**.

## 14. Production mutation audit

- No Kenos domain table growth
- Conversation persistence still fail-closed on canary (memory-session / no new rows)
- Three-layer write guards unchanged

## 15. Seven-site pause

All seven `stop_builds=true`. AIOS prod published still `6a5c617ee8396b00089a6d2e`.

## 16. Gallery

`disabled_manually`

## 17. Remaining gates

| Gate | State |
| ---- | ----- |
| AIOS production redeploy | Red — needs phrase below |
| Other six clients | Red — paused |
| Writer canary | Red |
| Live dual-account A→B | Yellow |
| OWNER SMOKE conversation cleanup | Yellow — awaits separate phrase |

## 18. Readiness for AIOS production redeploy

**Yes — awaiting Owner phrase only.**

```text
APPROVE_KENOS_AIOS_PRODUCTION_READ_ONLY_REDEPLOY
```

---

**Stopped. Production not redeployed.**
