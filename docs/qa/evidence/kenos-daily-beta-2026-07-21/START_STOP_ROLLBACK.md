# START_STOP_ROLLBACK

## Daily entry

Open: **http://127.0.0.1:5219/**  
(Chrome app mode: `bash scripts/kenos-daily-beta/kenos-ctl.sh open`)

## Lifecycle

```bash
# first time / after code changes
bash scripts/kenos-daily-beta/kenos-ctl.sh build
bash scripts/kenos-daily-beta/kenos-ctl.sh start   # install LaunchAgents + kickstart

bash scripts/kenos-daily-beta/bin/kenos-status
bash scripts/kenos-daily-beta/bin/kenos-doctor
bash scripts/kenos-daily-beta/bin/kenos-stop
bash scripts/kenos-daily-beta/bin/kenos-restart
bash scripts/kenos-daily-beta/bin/kenos-rollback   # swap previous ↔ current, restart
```

Login auto-start: LaunchAgents `RunAtLoad=true` + `KeepAlive=true`.

## Rollback rehearsal (executed)

1. `kenos-rollback` → previous release `58b6c183b687` served; health PASS  
2. `kenos-rollback` again → restored `aff9303903c1`; health PASS  
3. No cloud rows deleted; localStorage origins unchanged

## Uninstall agents (fallback to old entry)

```bash
bash scripts/kenos-daily-beta/kenos-ctl.sh uninstall
bash scripts/kenos-daily-beta/kenos-ctl.sh stop
```

Legacy still available: production `*.kenos.space`, or prior `scripts/aios/aios.sh` for AIOS-only 5219.
