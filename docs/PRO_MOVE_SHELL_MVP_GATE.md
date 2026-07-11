# PaperOS Shell MVP Gate (Phase 1)

**Status: PASS with known gaps** · 2026-07-09

> **UI pivot (2026-07-10):** This gate documents the **shipped 6-tab shell baseline**.
> The next product direction is paper-first OS UX — see
> [`qa/paperos-eink-uiux-agent-brief.md`](qa/paperos-eink-uiux-agent-brief.md) and
> [`qa/paperos-eink-uiux-gap-audit.md`](qa/paperos-eink-uiux-gap-audit.md).

PaperOS grew from a single Today screen into a 6-module e-ink shell:
Home · Today · Notes · Mail · Review · System, with an app-level refresh
policy, an offline action queue, device telemetry, and Quick Note ink
capture. Deployed and touch-verified live on the device.

## What shipped

| Area              | Implementation                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell IA          | Bottom nav with 6 modules, page-swap only (StackLayout), big touch targets, shared header with battery/pending/offline + Exit                             |
| Home              | Clock, next event (calendar cache), next action, focus, open loops (tasks/inbox/mail/pending), device status                                              |
| Today             | Focus card + 5-per-page pagination; checkbox → `task.complete`, Defer → `task.defer` (optimistic local state)                                             |
| Notes             | Quick Note v0: MouseArea/Canvas ink capture → strokes JSONL under `data/notes/<id>/` (`meta.json` + `page-001.strokes.jsonl`); input probe button         |
| Mail              | Triage skeleton reading `cache/mail.json` (self-explaining empty state until the backend feed exists); → Task enqueues `mail.convert_to_task`             |
| Review            | Done counts, pending queue, notes captured, shutdown checklist                                                                                            |
| System            | Sync now + state, refresh mode (Clean/Balanced/Fast) + Clean screen, frontlight probe, battery/storage/Wi-Fi/version, Return to reMarkable, recovery help |
| RefreshController | App-level: full-repaint flash every 1/6/16 page updates by mode; persisted to `refresh_mode.txt`; no driver access                                        |
| ActionQueue       | Append-only `data/queue/actions.jsonl`, 5 action types, pending count in UI, survives crash                                                               |
| DeviceStatus      | Battery/Wi-Fi/storage from /sys + QStorageInfo, 60s refresh; frontlight probe (read-only)                                                                 |
| Cache-first       | Unchanged `ApiClient` last-good behavior + `readCacheFile()` for `cache/{calendar,mail,…}.json` side-caches                                               |

Binary: 1.6M aarch64, deployed as `paperos.next` → promoted after checks.

## Live verification evidence

- Clean start, zero QML errors; log: font `Noto Sans CJK SC`, queue 0, notes 0, refresh `balanced`, shell up at 954×1696.
- Operator drove the UI by touch: refresh mode switched to `fast`, frontlight probe ran (found `/sys/class/backlight/rm_frontlight`, brightness 1600/2047, writable — a Brightness slider is feasible later).
- API failure path exercised for real: production Paper API returned **404** mid-test (2026-07-09); UI showed `offline/stale` and kept cached tasks. **2026-07-10复核：** `curl https://planner.kenos.space/api/paper/today` → **401**（路由正常）；见 hub **P-MOVE-VERIFY**（设备 token E2E 待复验）。
- `systemctl start paperos` runs the shell; `stop` restores xochitl. Device reboot boots stock xochitl normally.

## Incidents & findings during test

1. **"Frozen device" was a test-harness gap, not a hang.** The session was
   launched bare over SSH (no supervisor). The operator's Exit tap worked —
   the log shows a clean shutdown — but nothing restarted xochitl, and the
   e-ink kept the last frame. Rule going forward: **always launch via
   `systemctl start paperos` or `open-paperos.sh`**, never the bare binary.
2. **Marker taps do nothing anywhere in PaperOS.** The epaper QPA only
   creates a touchscreen handler; pen evdev events are never delivered to
   QML. Phase 0 diagnosis complete — see
   [PRO_MOVE_MARKER_PHASE0_INPUT_MAP.md](PRO_MOVE_MARKER_PHASE0_INPUT_MAP.md):
   `event2` "Elan marker input" exposes pen/rubber/pressure/distance/tilt,
   so a Phase-1 `PenInputService` is the unblocking work.
3. **`systemctl link` does not survive reboot** — `/etc` is overlay-managed
   on this OS; the symlink vanished after the operator power-cycled the
   device. Re-link is one command (in `deploy-paperos.sh`); documented as a
   post-reboot step. Boot chain remains stock xochitl by design.

## Known gaps (deliberate, next phases)

- Pen input (Phase 1 PenInputService) — touch-only until then; Quick Note
  currently captures finger/synthesized-mouse strokes only.
- Mail/calendar feeds — pages render empty states until the LifeOS backend
  exposes them; `cache/*.json` contract is ready.
- Queue drain/sync worker — actions accumulate locally; upload comes with
  the write-MVP phase (P-MOVE-5), gated on staging validation.
- `task.add` supported by the queue but has no on-screen keyboard UI.

## Safety constraint compliance

No xochitl patching; no `/home/root/.local/share/remarkable/xochitl`
access; runtime files under `/home/root/paperos` only (plus the one linked
unit symlink); no timers enabled; stock boot verified after a real reboot;
`recover-xochitl.sh` exercised twice this session.

## Rollback

```sh
ssh remarkable-pro-move 'cp /home/root/paperos/paperos.backup-<latest> /home/root/paperos/paperos'
# Optional: remove the launcher unit
ssh remarkable-pro-move 'rm -f /etc/systemd/system/paperos.service; systemctl daemon-reload'
```
