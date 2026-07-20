# Kenos UIUX Production Deploy Packet

**Status:** READY FOR OWNER REVIEW — **DO NOT PRODUCTION DEPLOY FROM THIS PACKET**

## Production boundaries (unchanged — verify live)

| Fact | Required |
|---|---|
| ProductionExecutor | Off |
| Outbox delivery | Off / 0 |
| Seven sites stop_builds | true |
| UIUX Gallery | disabled_manually |
| Portal `/today` cohort | Owner-limited only — do not expand |
| Capture cohort | Do not expand |
| Legacy revoke | Do not |
| Migrations | Do not apply from this work |
| Writers / flags | Unchanged by UIUX commits |

## What this packet contains

- Local Web preview (aios non-cloud build + `kenosDemo`)
- KenosIOS Simulator build (Debug)
- Screenshot artifacts under `output/uiux/kenos-compounding-2026-07-20/` (gitignored)
- Docs under `docs/qa/kenos-uiux-*`

## What this packet must NOT do

- Restore Netlify auto builds
- Re-enable UIUX Gallery production workflow
- Deploy AIOS / Portal / Planner / etc. production
- Apple TestFlight / App Store distribution
- Open Executor or Outbox

## Owner review checklist

1. Open local `aios` preview with `?kenosDemo=1`
2. Exercise Space Switcher (sidebar + mobile FAB)
3. Launch KenosIOS on iPhone 17 Pro Simulator
4. Confirm Fitness still opens as Fitness (deep link), not a Kenos rewrite
5. Confirm Approvals copy has no Executor jargon
6. Only then decide on any isolated Preview canary (non-production domain)

## Rollback

Revert UIUX commits; production sites remain paused — no deploy side effects if push-only with stop_builds.
