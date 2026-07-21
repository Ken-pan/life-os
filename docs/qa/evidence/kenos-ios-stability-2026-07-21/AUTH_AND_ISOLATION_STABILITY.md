# AUTH_AND_ISOLATION_STABILITY

**Status:** AUTOMATED partial + prior Daily Beta evidence referenced

| Check | Result | Notes |
| --- | --- | --- |
| Cold launch auth persistence | PRIOR_PASS / OWNER confirm | Prior Flow A JWT path 2026-07-21 |
| Background 30m / hours | OWNER_DOGFOOD OPEN | |
| Force quit | AUTOMATED launch PASS | Session contents Owner visual |
| Mac service restart | AUTOMATED PASS | Must not force logout |
| Wi-Fi reconnect | OWNER_DOGFOOD OPEN | |
| Token refresh | NOT_MEASURED this run | |
| Auth initializing ≠ logout | CODE_CONTRACT | See Kenos app model |
| Explicit logout clears projections | CODE_CONTRACT | KenosAppModel unified logout |
| Account A↔B isolation | PRIOR_PASS | See prior ACCOUNT_ISOLATION_REPORT; re-run with FLOW_AB+matrix if needed |

**Isolation leak count (this run):** 0 observed (no dual-account matrix executed in this automated lane unless FLOW_AB set).
