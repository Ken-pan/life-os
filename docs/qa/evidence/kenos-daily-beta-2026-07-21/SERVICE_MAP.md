# SERVICE_MAP

| Service      | Origin                  | Port | LaunchAgent                           | Build root                                    |
| ------------ | ----------------------- | ---- | ------------------------------------- | --------------------------------------------- |
| Kenos (aios) | `http://127.0.0.1:5219` | 5219 | `com.kenpan.kenos-daily-beta.aios`    | `~/.kenos-daily-beta/current/apps/aios/build` |
| Planner      | `http://127.0.0.1:5188` | 5188 | `com.kenpan.kenos-daily-beta.planner` | `…/planner/build`                             |
| Fitness      | `http://127.0.0.1:5190` | 5190 | `com.kenpan.kenos-daily-beta.fitness` | `…/fitness/build`                             |

## Runtime

- Process: `node ~/.kenos-daily-beta/bin/serve-static.mjs` (copy of repo script; avoids Unicode path in launchd)
- Health: `GET /__health` → `ok`
- Release identity: `GET /__kenos/release` → JSON `{ sha, environment: local-daily-beta, origins }`
- Logs: `~/Library/Logs/KenosDailyBeta/{aios,planner,fitness}.{stdout,stderr}.log`
- State: `~/.kenos-daily-beta/{current,previous,releases,snapshots}`

## Origin policy (local daily beta builds)

- AIOS built with `VITE_KENOS_LOCAL_DAILY_BETA=1` → Plan/Training deep links use localhost ports
- Planner/Fitness built with `VITE_KENOS_CONTINUE_ORIGIN=http://127.0.0.1:5219`
- Money / Music / Home / Knowledge may still open production (out of A scope)

## Not used for daily beta

- Vite DEV on 5197 / ephemeral preview terminals
- Fitness PWA preview port 4173
