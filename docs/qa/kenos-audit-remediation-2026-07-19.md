# Kenos P0–P4A audit high-priority remediation (2026-07-19)

Audit baseline: `1896250e27a96dd4112211502615b08cfea5f08a`
Remediation tip: recorded in Execution State after docs commit.

Verdict target: `KENOS AUDIT HIGH-PRIORITY REMEDIATION — LOCAL_PASS`
Not production cutover approval.

## Finding reconciliation (current HEAD)

| ID      | Status                                                               | Evidence                                                                                                 |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P1-001  | `DEFERRED_PRODUCTION_GATE` / `PRODUCTION_REMEDIATION_ARTIFACT_READY` | Inventory + revoke review SQL + ops plan; migrations still contain insert policies; **not** applied      |
| P1-002  | Fixed locally                                                        | MCP builds v1 Action; rejects `persistTask`; hosted RPC required                                         |
| P1-003  | Fixed locally                                                        | `policyRisk.mjs` authoritative classification; understated client risk rejected                          |
| P1-004  | Fixed locally                                                        | `auth_required` without authUserId; actor bound to auth                                                  |
| P2-001  | Fixed (docs)                                                         | Primary label `LOCAL_READ_ONLY_READY_NO_HOSTED_APPLY`                                                    |
| P2-002  | Fixed locally                                                        | `formatQueueCount` / null counts when unavailable                                                        |
| P2-005  | Fixed locally                                                        | Independent shadow fixtures; same-source self-compare rejected                                           |
| P2-008  | Partially fixed                                                      | Create path blocked; preset marks `writeToolsBlockedUntilHostedRpc`; `complete_task` still legacy upsert |
| P3-001  | Fixed (docs)                                                         | Primary `LOCAL_SIMULATION_AND_CONTRACT_READY`                                                            |
| P3-006  | `DEFERRED_PRODUCTION_GATE`                                           | OPEN-002 still PENDING (intentional)                                                                     |
| P4A-004 | `DEFERRED_PRODUCTION_GATE`                                           | InMemorySecureStore explicitly non-production                                                            |
| P4A-005 | Fixed locally                                                        | Unified `logout()` clears session/cache/queue/handoff                                                    |
| P4A-007 | Fixed locally                                                        | Classifier + disk reject work_confidential/sensitive/restricted                                          |

## Production gate

`BLOCKED_PENDING_HOSTED_APPLY_AND_CUTOVER` for planner_tasks direct-write revoke and Kenos RPC apply.
