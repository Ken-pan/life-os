# Kenos iOS — 3-Day Dogfood Checklist

**Goal:** 5–10 minutes/day on Ken’s iPhone 17 Pro.
**Status rule:** Only real calendar days count. Do not invent usage.
**Until Day 3 closes:** `IOS PERSONAL DAILY BETA: READY_LAN_DEPENDENT` (not STABILIZED).

## Before each day (optional, 30s)

On Mac:

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm run kenos:ios-dogfood-check
```

Expect: `READY FOR TODAY`
If `ACTION NEEDED: …` — fix that one line first (often unlock phone or `kenos-ctl start`).

## Daily core (same every day)

| # | Action | Pass if |
| --- | --- | --- |
| 1 | Cold launch from Home Screen | Today appears, no white screen |
| 2 | Today loads | Cards/content or honest empty — not infinite spinner |
| 3 | Continue → Plan | Correct task/context or Plan home |
| 4 | Edit one **safe test** task title | Saves with your account |
| 5 | Return to Kenos | Dock/return works, no Safari |
| 6 | Continue → Training | Correct set / honest Training home |
| 7 | Confirm set state | Matches expectation |
| 8 | Open Assistant | Stays in-app WKWebView |
| 9 | Open Inbox | Loads or honest empty/error |
| 10 | Open Space Shelf | Opens from Domain root / long-press Kenos |
| 11 | Quick Switch | Switches once, no loop |
| 12 | Background → foreground | Session kept |
| 13 | Force quit → reopen | Auth restored (no surprise login) |
| 14 | Re-login? | **No** (unless you logged out) |
| 15 | Bugs? | No white screen / Safari chrome / double Dock / wrong-account data |

## Extra fault (one per day)

| Day | Fault | Pass if |
| --- | --- | --- |
| **1** | iPhone Wi‑Fi off 10s → on → tap Retry if shown | Degraded then recover; Auth/Continue kept |
| **2** | Mac sleep ≥2 min → wake | App not wiped; retry works; no forced logout |
| **3** | Mac reboot **or** `kenos-ctl restart` | Services back; phone reconnects; no rebuild |

## Log

Fill `DAILY_LOG.md` + `day-N.json` (copy fields). Severity: P0 / P1 / P2 / none.

After Day 3 all pass with P0=0 and P1=0, Owner may mark STABILIZED.
