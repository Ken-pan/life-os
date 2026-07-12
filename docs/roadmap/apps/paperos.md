# PaperOS on reMarkable Paper Pro Move

**Owner:** **PaperOS (`PAPR`)** · first data provider **Planner** · **Device:** reMarkable Paper Pro Move (`imx93-chiappa`) · **Status:** `PAPR.SYS.1` primary lane; read path and live-ink baseline shipped

**Ticket ID（canonical）：** [`../TICKET_NAMING.md`](../TICKET_NAMING.md)

This is the execution plan for the Paper Pro Move UX path. The decision is to
build a home-only, session-based PaperOS first, then add autonomous
cache/scheduling only after the launcher path is recoverable. Planner is the
first functional provider for PaperOS.

> Numbering note: PAPR.DEV.3 was re-scoped during execution to the CJK font +
> pagination UX fix (the on-device blocker at the time). The controlled write
> MVP and later phases moved down; the old PAPR.DEV.3/4/5 scopes are now
> PAPR.WRITE.5/6/7.

## Current State

| Area                        | Status                           | Evidence                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device access               | PASS                             | `ssh remarkable-pro-move` (USB, `10.11.99.1`); see [`../../ops/paperos-device.md`](../../ops/paperos-device.md)                                                                                                          |
| Backend mock API            | PASS                             | PR-1 mock endpoints callable; see [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md)                                                                                                                         |
| Backend read API (prod)     | **PASS**                         | PAPR.DATA.verify 2026-07-11；见 [`../../qa/paperos/data-plane-2026-07-11.md`](../../qa/paperos/data-plane-2026-07-11.md)                                                                                           |
| Backend action API          | Implemented, gated               | `/api/paper/actions`; real writes require `PAPER_ACTIONS_WRITE_ENABLED=true`; full local HTTP validation passed                                                                                                                  |
| Device read cache           | PASS                             | `ApiClient` last-good cache (atomic write) + `refresh-cache.sh` sidecar; offline launch verified; see [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md)                                 |
| CJK rendering               | PASS                             | Noto Sans CJK SC loaded at runtime from `/home/root/paperos/fonts/`; see [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md)                                                      |
| E-ink pagination            | PASS                             | Fixed 5-per-page, Prev/Next buttons, no flick/animation; operator-verified on device                                                                                                                                             |
| Exit + crash recovery       | PASS                             | Exit button, hardened trap/recover scripts, systemd `ExecStopPost` auto-restores xochitl after `kill -9`; see [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md) |
| Device-side launcher        | PASS                             | `systemctl start paperos` (unit in `/home`, root-fs symlink only); survives SSH disconnect                                                                                                                                       |
| Shell MVP (6 modules)       | PASS                             | Home/Today/Notes/Mail/Review/System + RefreshController + action queue + Quick Note v0; see [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md)                                                               |
| Native ink primitive       | PASS on device                   | direct framebuffer + raw Marker input; continuous pressure ink and eraser verified — [`../../architecture/paperos-ink-runtime.md`](../../architecture/paperos-ink-runtime.md) |
| Production read API         | **PASS**                         | PAPR.DATA.verify 2026-07-11 — device 200 + schema + cache/UI；见 **PAPR.DATA.verify** 节                                                                                                                                         |
| Production write enablement | Not enabled                      | Staging validation required before `PAPER_ACTIONS_WRITE_ENABLED=true`                                                                                                                                                            |
| xochitl integration         | Out of scope                     | No xochitl patching, sidebar injection, or boot replacement                                                                                                                                                                      |

Completed device and PR gates are summarized once in
[`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md).

## Product Decision

Use **session-based PaperOS Mode**:

```text
stock boot -> xochitl -> systemctl start paperos (Conflicts stops xochitl)
          -> PaperOS foreground session
          -> Exit button / crash / systemctl stop
          -> ExecStopPost -> start xochitl
```

Do not patch xochitl and do not replace xochitl at boot. Paper Pro-class
devices need a conservative recovery story, and the current priorities are
safety, recoverability, autonomy, and update resilience.

## Execution Plan

`PAPR.DEV.1–4` 已完成，不再在活跃 roadmap 重复展开。结论见
[`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md)，
设备操作见 [`../../ops/paperos-device.md`](../../ops/paperos-device.md)。

### PAPR.DATA.verify — Device Production Sync · PASS (2026-07-11; was `P-MOVE.verify`)

**Goal:** confirm end-to-end device fetch against production (not "restore 404 route").

**2026-07-10 production check:**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://planner.kenos.space/api/paper/today
# → 401 (unauthorized) — route + function alive
```

- `_redirects` maps `/api/paper/today` → `paper-today` function; repo root `netlify.toml` sets `functions.directory = apps/planner/netlify/functions`.
- 2026-07-09 Shell MVP session logged a **transient 404** during live test; UI correctly fell back to offline cache. **Not reproduced** on 2026-07-10 curl.

**2026-07-11 device acceptance:**

- Device `ApiClient` real mode → production HTTP **200** with the device credential.
- Structural payload check PASS; cache and `last_sync.txt` updated twice, including an on-screen retry.
- System UI rendered the new sync timestamp; invalid credentials returned **401** without replacing the last-good cache.
- Sanitized evidence: [`../../qa/paperos/data-plane-2026-07-11.md`](../../qa/paperos/data-plane-2026-07-11.md).

**Agent:** Codex Terra + device operator tap.

### PAPR.UI — Paper-First E-Ink OS UX · IN FLIGHT

**Goal:** paper-native OS — canvas-first, contextual tools, temporary system surfaces.

**Execution SSOT:** [`../../qa/paperos/ui-spec.md`](../../qa/paperos/ui-spec.md)
**Evidence:** `docs/ui-qa-screenshots/paperos/device/baseline-2026-07-10/` · [`../../qa/paperos/reference/2026-07-10/`](../../qa/paperos/reference/2026-07-10/)

#### Shipped — Core Slice 1 (2026-07-10)

System drawer · Notes Gallery · native ink chrome states · semantic `paperctl` capture · xochitl recovery.

#### Now — Core Slice 1.1 · DEVICE GATE BLOCKED

**Native toolbar P0:** fixed in `52ae55e0` (`InkModeController` framebuffer sync).
**QML visual:** fixed in `d7c52858`; Antigravity delta gate PASS — archived in [`../../archive/paperos/milestones-2026-07.md`](../../archive/paperos/milestones-2026-07.md).

**Clean PR #27:** exact commit `cc122d30` / binary `599c9525d3b4…6dd89` was
built, promoted, and verified on the Move. Launch/exit, Drawer, Gallery,
editor return, recovery, and no-auto-retreat behavior PASS. Device metadata
reproducibly renders `pmUTC` / `amUTC`; physical pen tool/color/stroke match is
still BLOCKED. Full matrix → [`../../qa/paperos/ui-spec.md`](../../qa/paperos/ui-spec.md) §4.8.

**Next executable action:** fix the locale-safe `NoteStore` formatter with a
deterministic test, rebuild PR #27, then repeat its device gate. Do not un-draft.

#### Next — Core Slice 2 · STACK IMPLEMENTED · DEVICE GATE BLOCKED

PR #28 exact commit `3fa85277` / binary `2e36f6ce8439…8b47e` passed routing,
real Tasks, honest Documents, note-create refresh, and recovery. It failed
Today note-tile whitespace, Today long/CJK task truncation, Settings vertical
layout, and the inherited locale label; its HEAD also contains an unrelated
Fitness commit. Do not un-draft or merge. Full matrix → UI spec §5.9.

#### Deferred

Multi-page · Page Overview · Templates · OCR/Search · Tags · Quick Switcher · Control Center — next guide §10.

### PAPR.SYS — Device Shell Lifecycle · **PRIMARY LANE** 2026-07-12

PaperOS is becoming the **primary device shell**, not a foreground app. PAPR.DEV.4 covered exit/crash via systemd; **`PAPR.SYS.*`** extends to boot, sleep, wake, and daily use without Mac/SSH.

**Launch mode (2026-07-11):** **Mode A — Xochitl default**; implement **A-default, B-ready** (`PAPR.SYS.3` adds opt-in Beta auto-launch, default Off). **Lifecycle hub:** [`qa/paperos/README.md`](../../qa/paperos/README.md) · 产品假设见 [`qa/paperos/lifecycle.md`](../../qa/paperos/lifecycle.md) §产品假设.

**Checkpoint (2026-07-12):** Architecture discovery complete · **PAPR.SYS.1 PRIMARY LANE** — design → 分步 impl（Ken 逐步授权）· device safe.

**Agent:** Line B (Shell) — Codex + Ken + Cursor · **VERIFY belongs to Line E only**

| ID                  | Theme                   | Status (2026-07-12)                             | Owner               | Deliverable                                                                                  |
| ------------------- | ----------------------- | ----------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| **PAPR.SYS.0**      | Lifecycle discovery     | **CONDITIONAL PASS accepted**                   | Codex + Ken         | [`qa/paperos/lifecycle.md`](../../qa/paperos/lifecycle.md) |
| **PAPR.SYS.1a**     | Triple-power launch     | **BLOCKED / CLOSED**                            | —                   | 不得实现                                                                                     |
| **PAPR.SYS.1b.fs**  | Filesystem signals      | **BLOCKED / CLOSED**                            | —                   | lastOpened / fd / snapshot 不可用                                                            |
| **PAPR.SYS.1b.jrn** | Journal UUID signal     | **CONDITIONAL PASS accepted**                   | Codex + Ken         | `EntityOpen::open` 矩阵 10/10 · 0 FP                                                         |
| **PAPR.SYS.1**      | enter / exit / recovery | **PRIMARY LANE — design → 分步 impl**           | Codex · Ken         | `paperos-enter` · `paperos-exit` · journal watcher（按 Ken 授权分步）                        |
| **PAPR.SYS.2**      | sleep / wake / idle     | **NOT STARTED** — hard blocked by PAPR.SYS.1    | Codex               | pre-suspend flush · wake refresh · `lastSyncAt` catch-up                                     |
| **PAPR.SYS.3**      | Settings UI             | **OUT OF SCOPE**                                | Cursor · Fable ≤30m | auto-sleep · **Launch after unlock [Beta] Off**                                              |
| **PAPR.SYS.gate**   | Reliability matrix      | **BLOCKED**                                     | Ken + Codex         | [`qa/paperos/lifecycle-gate.md`](../../qa/paperos/lifecycle-gate.md)           |

**PAPR.SYS.1 System menu (minimum):** Sleep · Restart PaperOS · Return to reMarkable · Restart device · Shut down.

**Dependency:**

```text
PAPR.DATA.verify ✅
→ PAPR.SYS.0 🟡 accepted
→ PAPR.SYS.1 launch discovery ✅ (PAPR.SYS.1b.jrn conditional pass)
→ PAPR.SYS.1 implementation 🟡 PRIMARY LANE（2026-07-12 · Ken 分步授权）
→ PAPR.SYS.2 🔒
→ PAPR.SYS.3 (out of scope until PAPR.SYS.1/2)
→ PAPR.SYNC.6 🔒
→ PAPR.SYS.gate 🔒
```

Slice 2 **IA** may start after Slice 1.1 PASS; Slice 2 **device merge** must not bypass **PAPR.SYS.1**.

**PAPR.SYS.1 launch surface（2026-07-12）：** PAPR.SYS.1a closed · PAPR.SYS.1b.fs closed · **PAPR.SYS.1b.jrn conditional pass accepted** · **PAPR.SYS.1 PRIMARY LANE**（Ken + Codex 主航道）。完整矩阵见
[`qa/paperos/lifecycle.md`](../../qa/paperos/lifecycle.md)
§PAPR.SYS.1b.jrn。

**Supabase（Planner provider）：** 读路径 ✅ `paper_device_snapshot` · 写路径 **PAPR.WRITE.5** — `paper_device_actions` migration **未上生产** → [`../../ops/supabase.md`](../../ops/supabase.md) §PlannerOS

---

### PAPR.WRITE.5 — Controlled Write MVP · NEXT (was PAPR.DEV.3)

**Goal:** allow one safe paper action from the device.

Scope:

- Keep backend default dry-run.
- Enable `PAPER_ACTIONS_WRITE_ENABLED=true` only in staging first.
- Device sends `task.complete` with `clientBatchId`, `clientActionId`, and `baseVersion`.
- Device queue removes applied/duplicate actions and drops rejected permanent failures.
- UI: wire the mock checkbox to the action queue.

Acceptance:

- Fresh complete creates one `paper_device_actions` row (**requires migration apply** — 生产表尚未存在，2026-07-12）。
- Duplicate retry returns prior result without changing `completedAt`.
- Stale or deleted task returns conflict/rejected and refreshes cache.
- Production write switch remains off until staging passes.
- **DB：** `paper_device_actions` migration **未上生产**（2026-07-12 MCP）— 代码层已就绪。

### PAPR.SYNC.6 — Scheduled Cache / Manual Sync · BLOCKED on PAPR.SYS.2

**Goal:** reduce Mac dependency while preserving stock boot.

**Blocked until `PAPR.SYS.2`:** Linux system suspend freezes user-space timers; a naive "sync every 15 minutes" **does not run while suspended**.

Scope (revised):

1. **Active** periodic sync while PaperOS is awake
2. **Wake-time** reconciliation from `lastSyncAt` (debounce ~10s)
3. **Pre-suspend** flush of ink/state
4. "Sync now" button (reuses `ApiClient::fetchDashboard()`)
5. Optional `refresh-cache.sh` systemd timer — **active + wake only** for MVP; RTC wake = experiment
6. Performance baseline in gate doc

Acceptance:

- Stock boot remains xochitl-first until explicit Beta "launch PaperOS after startup"
- Timer removable with one rollback command
- Cache refresh never mutates xochitl document store

### PAPR.DEV.7 — Read-Only Document Export Track (was PAPR.WRITE.5)

**Goal:** explore xochitl-native discoverability without xochitl patching.

Scope:

- Generate a read-only Planner Today PDF/PNG from cached data.
- Treat xochitl document-store mutation as a separate risk gate.
- Prefer import/sync workflows over live local mutation while xochitl runs.

Acceptance:

- Exported document is readable offline.
- Refresh behavior is explicit: last rendered timestamp is visible.
- No live writes to xochitl storage while xochitl is running.

## Explicit Non-Goals

- No xochitl binary patching.
- No xochitl sidebar/tab injection.
- No boot replacement where PaperOS starts before stock xochitl.
- No checked-in device token or font binaries.
- No production write enablement before staging validation.

## Remaining Before Daily Use

- [x] **PAPR.DATA.verify** — PASS 2026-07-11: device production fetch 200 + schema + cache/UI refresh.
- [ ] **PAPR.UI.1.1** — PR #27 device gate **BLOCKED**：`pmUTC/amUTC` formatter FAIL + physical stylus gate ([`qa/paperos/ui-spec.md`](../../qa/paperos/ui-spec.md) §4.8).
- [x] **PAPR.SYS.0** — CONDITIONAL PASS accepted ([`qa/paperos/lifecycle.md`](../../qa/paperos/lifecycle.md)).
- [x] **PAPR.SYS.1b** discovery — PAPR.SYS.1b.fs closed · PAPR.SYS.1b.jrn **CONDITIONAL PASS accepted** (2026-07-11).
- [ ] **PAPR.SYS.1** — **PRIMARY LANE** — design → 分步 impl（Ken 逐步授权）；无授权步骤不得 enable watcher/systemd
- [ ] **PAPR.SYS.2** — **NOT STARTED** (hard blocked by PAPR.SYS.1 implementation verdict).
- [ ] **PAPR.SYS.gate** — LC-01–LC-15 ([`qa/paperos/lifecycle-gate.md`](../../qa/paperos/lifecycle-gate.md)).
- [ ] Integrate the device-proven raw Marker/direct-framebuffer primitive into the production `paperos-core` persistence boundary.
- [ ] Post-reboot step: re-run `systemctl link /home/root/paperos/paperos.service` (the `/etc` overlay drops the symlink); or fold into an OS-upgrade drill doc.
- [x] Operator confirms Exit-button tap on screen (worked — the "frozen" report was an unsupervised bare-binary test session; see Shell MVP gate incident 1).
- [ ] "Sync now" button (PAPR.SYNC.6).
- [ ] Font regression string in a repeatable QA step (中英混排 acceptance text).
- [ ] Performance baseline capture (PAPR.SYNC.6).
- [ ] OS-upgrade drill: relink unit + redeploy binary, record in gate doc.
- [ ] Staging validation, then production write enablement (PAPR.WRITE.5).
