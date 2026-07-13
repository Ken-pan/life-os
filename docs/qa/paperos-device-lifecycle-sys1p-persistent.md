# PAPR.SYS.1p — Persistent Mode A (DEFERRED after architecture investigation)

**Status:** **DEFERRED** (owner decision 2026-07-12) — investigation complete, no
code and no device changes made. Boot-persistence on the reMarkable Paper Pro
Move is only achievable by writing into the read-only root partition; owner chose
to defer and document rather than take that escalation now.
**Depends on:** [`paperos-device-lifecycle-sys1-implementation.md`](./paperos-device-lifecycle-sys1-implementation.md)
(SYS.1 **PASS**, Finding C hardening device-validated).
**Owner:** Ken · **Agent 线:** Line B (Shell)

## Authorized scope (for when this resumes)

Owner authorization 2026-07-12 — **Persistent Mode A only**:

- Persistent Mode A only; xochitl remains the default shell after boot.
- The lifecycle **watcher** (`paperos-watch`) may be enabled through systemd.
- "Open PaperOS" remains the **only** normal entry trigger.
- Emergency disable, compatibility fail-closed, crash-loop protection, and full
  rollback are **required**.
- Persistent device testing must stay **reversible** and **preserve native
  recovery**.

**Not authorized:** PaperOS auto-start at boot · launch after unlock · Mode B ·
changing the default boot target · disabling xochitl · PAPR.SYS.2 (sleep/wake).

## Why it was deferred — the device makes plain `systemctl enable` non-persistent

Read-only device probe (Paper Pro Move, `VERSION_ID=5.7.126`, 2026-07-12). The
whole SYS.1 design keeps everything under `/home`; SYS.1p's "survives reboot"
requirement collides with how this device stores system state.

### Mount architecture (verbatim evidence)

```text
/dev/root / ext4 ro,relatime                      # root = /dev/mmcblk0p3 (root_a), READ-ONLY
overlay /etc overlay rw,lowerdir=/etc,upperdir=/var/volatile/etc,workdir=/var/volatile/.etc-work
tmpfs /var/volatile tmpfs rw                       # => the /etc overlay upper is TMPFS
/dev/mapper/home-encrypted-disk /home ext4 rw      # /home = persistent (encrypted)
/proc/cmdline: root=/dev/mmcblk0p3 ro dm-mod.waitfor="PARTLABEL=root_a"
dmsetup: only home-encrypted-disk(crypt), persist(linear), swap(crypt)
         => NO dm-verity / dm-integrity target on root
```

Implications:

1. **`/etc` is a tmpfs overlay.** Any runtime write to `/etc` — including the
   symlink `systemctl enable` creates in
   `/etc/systemd/system/multi-user.target.wants/` — lands in
   `/var/volatile/etc` and is **wiped on every reboot**. This is exactly the
   SYS.1 *Finding A* observation ("the volatile `/etc` link was gone after
   reboot"), now root-caused.
2. **xochitl persists only because its enable symlink is baked into the
   read-only lower image** (`.../multi-user.target.wants/xochitl.service`, dated
   `2026-06-12`, the provisioning date). We cannot write there (ro root) and
   should not (vendor image).
3. **No `/home`-anchored boot hook exists.** Vendor persistence is done with
   baked systemd `.mount` units (e.g. `etc-dropbear.mount` bind-mounts
   `/home`-backed storage over `/etc/dropbear`); there is no rc.local, no custom
   generator, no `/home/root/.config/systemd`, and the vendor units that run
   from `/home` (`homecryptor`, `growfs-home`, `crashuploader`) are not
   user-extensible.
4. **Root is ro but NOT integrity-protected** (`dmsetup` shows no verity/
   integrity target). So `/usr/lib/systemd/system` (on the root partition, *not*
   overlaid) is technically writable after `mount -o remount,rw /`, and such a
   write **would** survive a normal reboot (lost only on OTA, which re-flashes
   the A/B root partition).

### Consequence

The only mechanism that yields real boot-persistence is **installing the watcher
unit into the read-only root partition** (`/usr`), which is the first write
outside `/home` in the entire SYS.1 design. Owner deferred this escalation.

## Options considered

| Option | Persists reboot? | Invasiveness | Notes |
| ------ | ---------------- | ------------ | ----- |
| **A — root-partition install** | **Yes** (lost on OTA) | Writes to vendor `/usr` on the ro root (remount rw) | Reversible by removing the unit + wants-symlink; safe (no verity); OTA loss already covered by the compat fail-closed gate. Only true boot-persistence. **First write outside `/home`.** |
| **B — session-only enable** | No | None outside `/home` | `paperos-ctl watch-enable` runs the watcher as a systemd service *this boot*; must be re-enabled after every reboot. Honors "everything in `/home`" but does **not** meet "persistent Mode A". |
| **C — defer + document** | — | None | **CHOSEN.** Preserve the finding; revisit the persistence mechanism before writing any code. |

## If/when resumed — implementation sketch (Option A)

Recorded so a future agent need not re-probe the (sleep-prone) device.

Mechanism (all reversible; native recovery preserved throughout):

1. `paperos-watch.service` (new unit): `Type=simple`,
   `ExecStart=/home/root/paperos/bin/paperos-watch`, `After=xochitl.service`,
   `Wants=xochitl.service` (not `Requires` — the watcher fail-closes on its own),
   `Restart=on-failure` with `RestartPreventExitStatus=1 4 5 6` (do NOT
   auto-restart the deliberate latch exits: restart-budget / bad-UUID /
   exhausted / incompatible), plus the unit's own `StartLimitBurst` so a wedged
   watcher cannot spin. `[Install] WantedBy=multi-user.target` (adds to the
   existing default target — does **not** change `get-default`).
2. Persistent install: `mount -o remount,rw /`; place the unit at
   `/usr/lib/systemd/system/paperos-watch.service` and the enable symlink at
   `/usr/lib/systemd/system/multi-user.target.wants/paperos-watch.service`
   (both on the non-overlaid root partition → survive reboot); `mount -o
   remount,ro /`; `systemctl daemon-reload`.
3. **Boot-time state reconciliation** — `paperos-ctl boot-reconcile` as the
   unit's `ExecStartPre`: if xochitl+rm-sync active and 0 PaperOS procs and the
   PaperOS unit inactive, force `state=NATIVE`, so a stale `PAPEROS_ACTIVE` left
   by a crash-reboot cannot block every future trigger.
4. `paperos-ctl watch-enable` / `watch-disable` as the only (gated, logged)
   persistent enable/disable entry points; deploy stays non-enabling.
5. Emergency disable preserved: the `DISABLED` marker still makes a running
   watcher inert; `watch-disable` fully stops+disables the service.
6. Rollback: `rollback-lifecycle.sh` remounts rw, removes the unit +
   wants-symlink, remounts ro, `daemon-reload`, `disable --now`; native path
   untouched.

Proposed file list (Option A):

- **New:** `apps/planner/paper-device/paperos-watch.service`
- **Modified:** `lifecycle/paperos-ctl` (watch-enable/disable, boot-reconcile),
  `lifecycle/paperos-lib.sh` (boot_reconcile + install/remove helpers),
  `deploy-lifecycle.sh` (persistent root-partition install, gated),
  `rollback-lifecycle.sh` (remove from root partition), `tests/sys1/run-tests.sh`
  (enable/disable, boot-reconcile, unit-file lint), `lifecycle/README.md`.

Reversible device gate (Option A): probe → install unit (root-partition) →
`watch-enable` (verify watcher up, xochitl still default, PaperOS *not* started)
→ one Open PaperOS enter/exit (Finding-C cadence) → **normal `systemctl reboot`**
→ verify xochitl default + watcher persisted + PaperOS not auto-started +
`get-default` unchanged → emergency-disable + compat fail-closed checks →
rollback (watcher removed, native verified, persistence gone).

## Open question for the owner (blocks resume)

Boot-persistence here means one write outside `/home` (Option A) or accepting
non-persistence (Option B). No middle path exists on this hardware without a
vendor-sanctioned `/home` boot hook (none found). Resume once the mechanism is
chosen.

## Device state after this investigation

**Unchanged / pristine clean-native.** Only read-only probes were run
(`systemctl show`, `findmnt`, `/proc/mounts`, `dmsetup`, `ls`); no deploy, no
`systemctl` state change, no writes. SYS.1 runtime remains purged from the device
(as left by the SYS.1 gate). No rollback required.
