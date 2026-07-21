# Known residuals

1. PaperOS not in monorepo — PARTIAL legacy placeholder only
2. ~~Device smoke Spaces→Domain→Kenos per domain pending LAN~~ → **PASS_LAN** 2026-07-21 (see `REAL_DEVICE_SMOKE.md`)
3. Today L1 lines still empty stubs until live read providers fill
4. Phase 4 EXIT_OPEN; APNs/TestFlight out of scope
5. Knowledge→Library rename is domain-id only (no DB migration)
6. ~~Money/Library/Music/Home/Health LAN static servers not yet in `kenos-ctl` LaunchAgents~~ — **closed 2026-07-21** via companion LaunchAgents in `kenos-ctl.sh install` (serve `apps/*/build` on 0.0.0.0). Residual: companions depend on local app builds, not Daily Beta release snapshot; avoid vite on Continuity ports.
7. Money AuthGate on cold Continuity until Owner login on device
8. Work production capability reads remain local-off by design
