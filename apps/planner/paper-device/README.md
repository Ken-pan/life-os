# PaperOS Paper Device Templates

These files are repo-side templates for the reMarkable Paper Pro Move deployment
under `/home/root/paperos`.

Earlier device setup used `/home/root/planneros-lite`. Treat that as the
legacy verified workspace. On the next live-device session, inspect it first and
then copy, rename, or symlink it to `/home/root/paperos`.

The first supported UX path is a session-based foreground app:

1. Stock xochitl boots normally.
2. `open-paperos.sh` stops xochitl.
3. The PaperOS Qt/QML binary runs in the foreground.
4. On normal exit, signal, or crash, the shell trap starts xochitl again.

This directory intentionally does not include systemd units or xochitl patches.
Those are later phases and must be installed only after the home-only launcher
path is verified on device.

## Target Device Layout

```text
/home/root/paperos/
  paperos
  config.json
  token
  cache.json
  last_sync.txt
  open-paperos.sh
  recover-xochitl.sh
  refresh-cache.sh
```

## Deploy Template Files

```bash
apps/planner/paper-device/deploy-paperos.sh
```

The deploy script copies the legacy `/home/root/planneros-lite/planneros-lite`
binary to `/home/root/paperos/paperos` when no PaperOS binary exists yet. It
also preserves the old workspace as a rollback point.

## Refresh Cache

```bash
ssh remarkable-pro-move /home/root/paperos/refresh-cache.sh
```

## Run

```bash
ssh remarkable-pro-move /home/root/paperos/open-paperos.sh
```

## Recover

```bash
ssh remarkable-pro-move /home/root/paperos/recover-xochitl.sh
```

If the foreground app exits normally, the recovery script should not be needed;
it exists for partial deploys, app crashes, and manual recovery.
