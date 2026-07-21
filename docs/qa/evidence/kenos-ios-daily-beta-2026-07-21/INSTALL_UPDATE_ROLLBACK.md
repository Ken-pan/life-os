# INSTALL_UPDATE_ROLLBACK

## Install (current)

```bash
export KENOS_STATIC_BIND=0.0.0.0
./scripts/kenos-daily-beta/kenos-ctl.sh restart
export KENOS_DAILY_BETA_ORIGIN="http://$(ipconfig getifaddr en0):5219"
./scripts/kenos-ios-daily-beta/device-build-install.sh
```

Records:

- `~/.kenos-daily-beta/ios-build-sha.txt`
- `~/.kenos-daily-beta/ios-build-number.txt`
- `~/.kenos-daily-beta/lan-origin.txt`

## Update

Re-run `device-build-install.sh` (overwrites app on device). Mac release via `kenos-ctl.sh build && install && restart` if web assets change.

## Rollback

1. **iOS app:** reinstall previous DerivedData/`KenosIOS.app` if archived, or `git checkout <prev-sha>` + rebuild. Device uninstall:  
   `xcrun devicectl device uninstall app --device <id> space.kenos.app.ios`
2. **Mac Web fallback (retained):** `http://127.0.0.1:5219/` via `kenos-ctl` — do not delete.
3. **Domain apps:** production `planner.kenos.space` / `fitness.kenos.space` entries remain available when Daily Beta origins off.

## Rollback drill (this session)

| Step | Result |
| --- | --- |
| Install current iOS Daily Beta | PASS |
| Verify shell/data fetch from phone IP | PASS (Today/Inbox/Planner/Fitness assets) |
| Stop Mac backend (offline) | PASS (health down) |
| Restore `kenos-ctl start` | PASS |
| Phone refetch after recovery | PASS |
| Mac Web fallback still present | PASS (not removed) |

Data loss: **none observed** (static assets + Keychain/WK store).
