# PaperOS Production Data-Plane Verification（PAPR.DATA.verify）

**Date:** 2026-07-11
**Device:** reMarkable Paper Pro Move (`imx93-chiappa`)
**Verdict:** **PASS**
**Scope:** production read path only; no production routing or write-path changes

## Sanitized result

| Evidence               | Result                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Request timestamp      | `2026-07-11T15:49:52+0000`                                                                                  |
| HTTP status            | `200 OK` from `https://planner.kenos.space/api/paper/today` with the device credential                      |
| Response schema result | PASS — root object; `today` object; `tasks` array of objects; `inbox` object                                |
| Cache timestamp before | `2026-07-11T05:59:15Z` (`7014` bytes)                                                                       |
| Cache timestamp after  | `2026-07-11T15:50:51Z` (`4619` bytes)                                                                       |
| UI result              | PASS — PaperOS System rendered `synced 2026-07-11T15:51:52Z` after the retry                                |
| Retry result           | PASS — on-screen **Sync now** advanced `last_sync.txt` from `15:50:51Z` to `15:51:52Z`                      |
| Error behavior         | PASS — an invalid credential returned `401 Unauthorized`; the production cache timestamp remained unchanged |

No raw token, authorization header, task title, cookie, password, or private key is recorded here.

## Verified chain

```text
/home/root/paperos/token (mode 600)
→ deployed ApiClient real-mode defaults
→ production GET /api/paper/today
→ HTTP 200
→ JSON object accepted by ApiClient + structural schema check PASS
→ atomic cache replacement
→ last_sync.txt update
→ PaperOS System sync status update
```

The deployed `config.json` omits an explicit `mode`, so the compiled `ApiClient`
default of `real` applies. The first app launch updated both cache and sync
timestamp. A second request initiated through the visible System control updated
them again.

## Device baseline relevant to the data plane

- Product: reMarkable Chiappa / i.MX93 / aarch64.
- Installed OS: Codex Linux `5.7.126 (scarthgap)`; image `3.27.3.0`.
- Deployed path: `/home/root/paperos/paperos`.
- Deployed SHA-256: `cd69ddcd4002de219b0e4a49081256f523a74a94f74a9a608bc045485f2c944f`.
- Persistent writable filesystem: encrypted ext4 `/home` (`45.6G` free during verification).
- Root `/` is read-only; `/etc` is a volatile overlay.
- Repository build tooling targets the chiappa SDK. The available recorded build
  environment is chiappa `5.7.119`, while the installed device OS is `5.7.126`.
- The current device binary does not match the local `build-docker/paperos` hash,
  so its exact local artifact provenance remains unproven. Runtime compatibility
  on this chiappa device was directly verified.

## Commands and checks

- Read-only OS, systemd, service, process, power-state, mount, artifact, and
  network baseline over USB SSH.
- `paperctl start --binary /home/root/paperos/paperos` and local-only bridge
  readiness/state checks.
- Sanitized production request status and structural JSON validation.
- System navigation, **Sync now**, semantic state, and screenshot inspection.
- Invalid-credential `401` check with cache-mtime preservation.
- Normal **Return to reMarkable**, followed by `xochitl=active` and
  `rm-sync=active` verification.

## Rollback and residual risks

- Rollback performed: normal PaperOS exit restored Xochitl and rm-sync; no
  PaperOS process remained.
- No route, token, config, service unit, or production environment was changed.
- `cache.json` was observed as mode `644` although deploy templates intend mode
  `600`; fix this in the later managed install/lifecycle work without exposing
  its contents.
- `ApiClient` disables TLS peer verification. This verification proves current
  connectivity, not transport security; address separately before daily-use
  release.
- The app accepts any top-level JSON object; the stronger structural schema
  check in this gate is external to the current client implementation.

## Next allowed task

`PAPR.SYS.1` design — **PAUSED BY OWNER** until explicit authorization.
Architecture discovery complete: PAPR.SYS.1b.jrn **CONDITIONAL PASS accepted** (journal `EntityOpen::open` UUID).
See [`paperos-device-lifecycle-discovery.md`](./paperos-device-lifecycle-discovery.md)
§Future resume point. `PAPR.SYS.1` implementation **not started**.
