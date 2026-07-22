---
title: KENOS F5-02–04 — Combined Final Report
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-final-report
status: F5_02_04_PASS_LOCAL_READY_FOR_PRODUCTION_GATE
---

# KENOS F5-02–04 — Supabase Closure · Security Red Team · Architecture Convergence

## 1. Overall result

`F5_02_04_PASS_LOCAL_READY_FOR_PRODUCTION_GATE`

## 2. Phase results

```
F5-02 SUPABASE:      PASS_LOCAL_READY_FOR_PRODUCTION_GATE
F5-03 SECURITY:      PASS_NO_KNOWN_P0_P1
F5-04 ARCHITECTURE:  LOCAL_VERIFIED
```

All work is on local branch `kenos-f5-02-04` (12 commits, not pushed). No
production apply/deploy/merge performed.

## 3. What is now trustworthy (proven by code + tests)

- The canonical **core-loop schema rebuilds from migrations into an empty DB**
  (32 migrations, 0 failures) — `scripts/kenos-cleanroom/replay.sh`.
- **User isolation** under RLS + RPC: anon denial, cross-user SELECT/UPDATE/
  DELETE/INSERT-spoof rejection, actor≠auth.uid rejection, Activity/Capture
  caller-scoping, IDOR-through-RPC (convert/complete) rejection — 14 assertions.
- **Mutation integrity**: idempotent replay (duplicate:true, stable id), distinct-
  key isolation, atomic task+activity+outbox, action-UUID rebind rejection,
  fail-closed on malformed input — 6 assertions.
- **iOS session tokens** are no longer stealable via a spoofed WebView host
  (exact-suffix host gate + real-origin anchoring).
- **AI cannot exfiltrate** private context through `fetch_url`, and injected
  instructions in external tool output are quarantined as untrusted data.
- **Device-auth** MAC comparison is constant-time; the HMAC secret fails closed.
- **Logs redact** tokens/JWT/keys/email/secret-keys before upload.
- **Single canonical writer** per entity; internal tables are RPC-only (client
  direct read/write denied); a static guard blocks regression.

## 4. Canonical architecture

| Entity | Owner | Write path | Read path | Activity source | Continue | Authz | Idempotency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Capture | `kenos_capture_envelopes` (owner_id) | `kenos_ingest_capture_envelope_action` (SECDEF) | `kenos_list_capture_envelopes` | RPC-internal | — | RLS own-row + RPC actor=auth.uid | `kenos_plan_action_idempotency` |
| Plan Task | `planner_tasks` (user_id) | `kenos_create/update/complete_*` RPC (canonical); Legacy repo.js sync (cutover-gated) | Planner own-row RLS + portal_today_summary | `kenos_plan_activity` | entityId in descriptor | RLS USING+WITH CHECK; RPC actor check | per key |
| Activity | `kenos_plan_activity` (user_id, append-only) | Plan RPCs in-txn | `kenos_list_plan_activity` | itself | — | own-row RLS; SECDEF search_path pinned | in-txn |
| Continue | localStorage (owner-bound) | Continue CTA | AIOS sheet | — | resolves canonical entityId | owner binding + RLS on fetch | — |

## 5. Supabase evidence

- Clean migration replay: `Applied 32 migrations, 0 failures` (PG17 local stack).
- RLS suite: T1–T14 PASS. RPC suite: R1–R6 PASS. (`replay.sh` exit 0.)
- Schema/constraint change: `fitness_core_schema.sql` invalid
  `create policy if not exists` → idempotent form (real SQL defect).
- Realtime: none in core loop (N/A by design; clients re-fetch canonical state).
- Storage: signed-URL private buckets (aios-images, planner attachments); no
  cross-user path found.
- Env isolation: production fallback is the implicit default when env unset
  (mitigated by prodWriteGuard) — owner note A1.
- Secret scan: no service-role/private-key values in tracked files or client
  bundles; publishable key only.
- Generated types: none — `@life-os/contracts` (Zod) is the SSOT, Swift parity-checked.

## 6. Security findings

**Fixed P1** — iOS WebView session-token theft (substring host gate →
account takeover): exact-suffix host matching + real-origin anchoring;
regression `testWebAuthRelatedHostSpoofRejected`. · AI `fetch_url`
exfiltration (lethal trifecta): egress guard blocks PII/high-entropy outbound
data to non-allowlisted hosts; 6 tests.

**Fixed P2** — tool-output injection blind spot (external content wrapped);
device-auth timing side channel + weak-secret fallback; log redaction gaps.

**Accepted / owner-gated** — Continuity WebView origin allowlist + WKAppBoundDomains
(risk breaking LAN beta); web resume LAN-host-on-dev-port; `paper_device_snapshot`
broad read behind one bearer token; prod-fallback default. See F5-03 report §2.

**No P0.** Cross-user isolation, AI ownership (JWT-derived), web XSS
(escape-first renderer), SQL injection (no dynamic SQL), secret exposure — all
verified safe with file:line in the F5-03 report.

## 7. Architecture convergence

- Duplicate writers: Plan Task has two mechanisms to the SAME table
  (Legacy sync + Kenos RPC = documented KR-P1-001A migration, cutover owner-gated,
  no double Activity). Capture has one flag-gated legacy competitor (AIOS
  `plannerAddTask` life_events) with a convergence target.
- Fake paths: Activity fake-success removed in P5; demo data localhost-only;
  Apple FakeActionExecutor throws on productionWrite.
- Contracts/errors/Activity/Continue consolidated on `@life-os/contracts` +
  deterministic RPC error codes + single Activity source + owner-bound Continue.
- Static guard `check-kenos-architecture.mjs` wired into the verify suite.
- No legacy code deleted (protocol: prove zero callers first); two paths tracked
  for removal after cutover.

## 8. Tests & commands

```
supabase start && scripts/kenos-cleanroom/replay.sh      # 32 migrations + T1-14 + R1-6 PASS
npm test -w aios-os                                       # 313 pass (egress guard, injection wrap)
node apps/planner/server/trustedDeviceAuth.test.mjs       # forged-MAC + timing PASS
xcodebuild -scheme KenosMac ... build                     # PASS (host spoof test compiles)
bash scripts/verify-kenos-refactor.sh                     # all deterministic gates PASS (incl. new arch guard)
```
No skipped tests. No mocked-persistence used as end-to-end proof (real local Postgres).

## 9. Local commits (branch `kenos-f5-02-04`)

```
01c5bd893 fix(db): fitness_core valid SQL + clean-room replay harness
622aab29b docs(qa): F5-02 report + evidence + cutover gate
f4d0ea005 test(security): IDOR-via-RPC regression tests
4ef133c97 fix(auth): constant-time MAC compare + fail-closed HMAC secret
347b602b2 fix(security): block AI tool-egress exfiltration (fetch_url)
a7bd88352 fix(security): scan external tool output for prompt injection
e5a3548b4 fix(security): close iOS session-token theft via WebView bridge
413be591e fix(privacy): redact email/secret-key/api-key in app logs
ff12224f3 docs(qa): F5-03 security red-team report
700cd61cb feat(guard): static architecture-convergence check
42644d031 docs(ledger): record F5-02/03/04 closure + convergence debt
2ac24019d docs(qa): F5-04 architecture convergence report
```

## 10. Production approval gate

**GATE A/B — apply the two drifted migrations** (F5-02 report §6): exact
preflight + apply + rollback + verification commands. Non-destructive, additive.
No client release ordering needed.

**Other owner gates (do NOT auto-execute):**
- `supabase migration squash` remediation for the non-replayable full 6-app union.
- iOS: add `WKAppBoundDomains` + Continuity navigation allowlist (verify LAN/ts.net
  still loads); set `APPLE_APP_ATTEST_ALLOW_DEV=0` for App Store builds.
- Prod env: set `DEVICE_AUTH_HMAC_SECRET` (decouple from service-role key).
- Converge AIOS `plannerAddTask` onto `kenos_create_plan_task_action`.
- Writer cutover: freeze Legacy `repo.js` planner_tasks writer after RPC bake.

## 11. Remaining risks

- Full-union migration set is not from-empty replayable (squash debt) — CI proves
  the core loop only until the squash lands.
- Prod schema has out-of-band drift (crash view unrecorded) — GATE B reconciles.
- iOS Continuity WebView still loads arbitrary origins (now token-safe, but no
  navigation allowlist) — owner gate.
- Plan Task writer cutover not executed — two write mechanisms to one table until then.

## 12. Owner review checklist (~15 min)

- [ ] Run `scripts/kenos-cleanroom/replay.sh` → expect `CLEAN-ROOM ... PASS` (32 + T1-14 + R1-6).
- [ ] Skim F5-03 report §2 — confirm the two P1 fixes and accept the P2 owner-gated list.
- [ ] Review GATE A/B commands (F5-02 §6); approve or defer the two migration applies.
- [ ] Confirm the convergence debt (plannerAddTask, writer cutover) is acceptable as
      tracked (flag-gated off in prod).
- [ ] Decide on the iOS owner gates (App-Bound-Domains, ATTEST_ALLOW_DEV=0) timing.
- [ ] Approve/decline `supabase migration squash` scheduling.
```
```
