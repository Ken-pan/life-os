# AUTH_AND_DATA_SAFETY

## Session storage

| Layer | Store | Notes |
| --- | --- | --- |
| Native shell | `SecItemSecureStore` → Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) | Replaces `InMemorySecureStore` on iOS |
| Web surfaces | `WKWebsiteDataStore.default()` | Cookies / localStorage for AIOS SPA; survives relaunch on same device |
| Settings origin | `UserDefaults` URL only | **Never** tokens |

## Guards

- Origin field rejects `127.0.0.1` / `localhost`
- No token in URL / plist / logs by design
- No production DB migration
- No long-lived dual-write added
- Logout clears Keychain session + space switcher resume cache

## Isolation

- Mac Continuity A/B evidence remains frozen/valid for account scoping
- Device Account B isolation not re-executed this slice → **PARTIAL**
- RLS / account isolation not weakened

## DATA SAFETY

**SAFE** — no production schema change; local Keychain + WK data only; Mac Web fallback retained.
