# Money Domain Gate — 2026-07-21

**Status:** `DAILY_BETA_INTEGRATED` (embedded Finance OS; privacy-preserving Continuity)

## Strategy

**B Embedded Web** — `apps/finance` Continuity WKWebView.

## Wired

| Surface | Implementation |
| ------- | -------------- |
| Registry | money `integrationStatus: integrated`, alias finance→money |
| Nav | Kenos · Today · Transactions · Plan · More |
| Continuity | `KenosDomainRegistry.homeURL("money")` → `/home/today` (LAN :5180) |
| Adapter | `financeSpaceAdapter.js` — sanitize amounts from resume subtitles |
| Chrome | hide web tabbar/aside; DomainMusicHeader when iosNativeShell |
| Leave-guard | installed; compose → transactions |

## Privacy

- Resume descriptors never store balances / account numbers.
- `sanitizeMoneySubtitle` strips currency amounts.

## Residuals

- Device smoke pending LAN finance preview.
- Inbox/Assistant providers still stub (Phase C).
