# Real Device Smoke — All Domains

**Status:** PASS_LAN  
**Device:** iPhone 17 Pro `8097F071-CAB6-5AF0-8258-BCD985E9D79E` (USB UDID `00008150-000C38C20AC0401C`)  
**When:** 2026-07-21T14:29Z–14:31Z  
**LAN Mac:** `10.20.202.15`  
**Native build:** CFBundleVersion `202607211429` · `INSTALL_OK`

## Origins (phone-reachable)

| Surface | Origin | Health |
| ------- | ------ | ------ |
| Kenos / Work | `http://10.20.202.15:5219` | 200 |
| Plan | `http://10.20.202.15:5188` | 200 |
| Training | `http://10.20.202.15:5190` | 200 |
| Money | `http://10.20.202.15:5180` | 200 |
| Library | `http://10.20.202.15:5879` | 200 |
| Music | `http://10.20.202.15:5189` | 200 |
| Home | `http://10.20.202.15:5196` | 200 |
| Health | `http://10.20.202.15:5192` | 200 |

`kenos-ctl` serves aios/planner/fitness. Money/Library/Music/Home/Health were LAN-served via `serve-static.py` on `0.0.0.0` for this smoke (not LaunchAgents).

## Matrix (Spaces → Domain home → Kenos)

Method: `devicectl … --payload-url` Continuity deep link + `kenos://return`; screenshots via `pymobiledevice3 developer dvt screenshot --userspace`.

| Domain | Domain home | Return Kenos | Dual dock | Notes |
| ------ | ----------- | ------------ | --------- | ----- |
| Spaces | `10-spaces.png` | — | n/a | Kenos Mode pill |
| Work | `20-work-home.png` | `21-work-return-kenos.png` | PASS (Work dock) | Capability reads locally off |
| Money | `30-money-home.png` | `31-money-return-kenos.png` | PASS | AuthGate login card; native Money dock |
| Library | `40-library-home.png` | `41-library-return-kenos.png` | PASS | DomainMusicHeader + Library dock |
| Music | `50-music-home.png` | `51-music-return-kenos.png` | PASS | DomainMusicHeader; empty library OK |
| Home | `60-home-home.png` | `61-home-return-kenos.png` | PASS | Storage canvas; Home dock |
| Health | `70-health-home.png` | `71-health-return-kenos.png` | PASS | DomainMusicHeader + Health dock |
| Plan | `80-plan-home.png` | `81-plan-return-kenos.png` | PASS | Regression |
| Training | `90-training-home.png` | `91-training-return-kenos.png` | PASS | Regression |
| Spaces final | `99-spaces-final.png` | — | n/a | |

## Chrome fixes verified this pass

1. Web BottomNav / mobile-tabbar hidden under `data-ios-native-shell` (CSS belt + reactive `?iosNativeShell=1`).
2. DomainMusicHeader moved into scroll `main` (Music/Library/Home/Health) so status-bar pad matches Plan/Training.
3. Swift `KenosDomainRegistry.isEmbeddedWebContinuityURL` covers all embedded ports **including Health `:5192`** and Work `/work` paths.

## Blockers

None for this LAN session. Earlier Money blank frame was finance not bound to LAN (`127.0.0.1` only) — fixed by restarting `serve-static.py` on `0.0.0.0:5180`.
