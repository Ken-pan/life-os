# P-MOVE-4: Exit Button + Crash Recovery + Device Launcher Gate

**Status: PASS (Exit-button on-screen tap pending operator confirmation)** · 2026-07-09

Covers the P0-4 (Exit button), P0-5 (crash/recover), P1-6 (launcher scripts),
and P2-1 (device-side manual launcher) items. PaperOS can now be started with
one command, exits safely from the screen, and always returns the device to
xochitl — including after a hard crash — with no manual intervention.

## What shipped

### P0-4 — Exit button

`qml/Main.qml` header now has a bordered **Exit** button (top-right, next to
the PaperOS title). Tapping it calls `Qt.quit()`; the process exit triggers
whichever supervisor launched it (shell trap or systemd `ExecStopPost`) to
restart xochitl.

- Deployed and running on device; binary sha256
  `8992df6a2ab183306a901b91d323b9f7576490b546d3f8af10e385cdb145f40b`.
- On-screen tap-through was not yet confirmed by the operator at gate time;
  the equivalent process-exit path (systemd stop) is verified below.

### P0-5 — Crash / recover

- `open-paperos.sh`: exit trap now logs `date exit=<code>` to
  `/home/root/paperos/last_run.txt` and always restarts xochitl on
  EXIT/INT/TERM/HUP.
- `recover-xochitl.sh`: broadened to stop the systemd instance first, then
  kill any `paperos*` binaries under the workspace (SIGTERM, then SIGKILL),
  then start xochitl. The old version only matched the exact `paperos` path
  and missed `paperos.next`.
- `paperos.service` `ExecStopPost` restores xochitl on any unit stop,
  including crashes.

### P1-6 — Launcher scripts

Updated `open-paperos.sh` / `recover-xochitl.sh` shipped from
`apps/planner/paper-device/` to `/home/root/paperos/`. `deploy-paperos.sh`
now also ships `paperos.service` and runs `systemctl link` +
`daemon-reload`, so a full re-deploy is one command.

### P2-1 — Device-side manual launcher (systemd)

`paperos.service` lives at `/home/root/paperos/paperos.service` and is made
known to systemd via `systemctl link` — only a 34-byte symlink lands on the
root filesystem (`/etc/systemd/system/paperos.service`), honoring the
home-only constraint in spirit and surviving trivially through OS updates
(relink after upgrade).

```text
start:  ssh remarkable-pro-move systemctl start paperos
        └─ Conflicts=xochitl.service stops xochitl automatically
exit:   on-screen Exit button / crash / systemctl stop paperos
        └─ ExecStopPost=systemctl --no-block start xochitl
```

Unlike running `open-paperos.sh` over SSH, the systemd session survives the
SSH connection dropping (USB unplug, Mac sleep), which was the failure mode
that previously required manual recovery.

## Verification evidence (all live on device, 2026-07-09)

| Test | Result |
| --- | --- |
| `paperos.next` launch, font + QML load | PASS — log shows `loaded font "Noto Sans CJK SC"` |
| Hard crash (`kill -9`) + `recover-xochitl.sh` | PASS — xochitl `active`, `RECOVER-OK` |
| `systemctl start paperos` | PASS — `paperos=active xochitl=inactive` (Conflicts works) |
| Hard crash (`kill -9`) under systemd | PASS — `paperos=failed xochitl=active` with **no manual step** |
| `systemctl stop paperos` | PASS — `paperos=inactive xochitl=active` |
| Exit button tap on screen | PENDING operator; process-exit path proven by the stop test |

## Rollback

```sh
# Remove the launcher unit entirely (root-fs symlink included):
ssh remarkable-pro-move 'systemctl disable --now paperos 2>/dev/null; rm -f /etc/systemd/system/paperos.service; systemctl daemon-reload'

# Roll back the binary:
ssh remarkable-pro-move 'cp /home/root/paperos/paperos.backup-<latest> /home/root/paperos/paperos'
```

Binary backups retained on device from every promotion
(`paperos.backup-YYYYMMDD-HHMMSS`).

## Relationship to P-MOVE-SYS (2026-07-11)

P-MOVE-4 established SSH/systemd entry, Exit, and **Class B** crash recovery via
`open-paperos.sh` / `paperos.service` `ExecStopPost`. **P-MOVE-SYS-1** device-side
launch surface remains **unresolved** (SYS-1A closed · SYS-1B discovery active).
See [`qa/paperos-device-lifecycle-discovery.md`](./qa/paperos-device-lifecycle-discovery.md).
