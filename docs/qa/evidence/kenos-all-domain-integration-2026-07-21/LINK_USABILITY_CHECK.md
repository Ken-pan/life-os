# Link Usability Check — Kenos All-Domain Continuity

**When:** 2026-07-21T14:39Z–14:45Z  
**Device:** iPhone 17 Pro `8097F071-CAB6-5AF0-8258-BCD985E9D79E` (phone LAN `10.20.202.6`)  
**Mac LAN:** `10.20.202.15`  
**Baseline claimed:** `REAL_DEVICE_SMOKE.md` PASS_LAN — **re-verified, not trusted alone**

## Verdict

| Domain | HTTP home | Dock paths | Device Continuity launch | `kenos://return` | Dual dock (visual) | Score |
| ------ | --------- | ---------- | ------------------------ | ---------------- | ------------------ | ----- |
| work | PASS `:5219/work` | PASS | PASS (phone GET `/work?iosNativeShell=1`) | PASS launch | NOT re-shot | **PASS** |
| money | PASS `:5180/home/today` | PASS (8/8) | PASS (phone GET + assets) | PASS launch | NOT re-shot | **PASS** |
| library | PASS `:5879/` | PASS (7/7) | PASS (phone GET + manifest) | PASS launch | NOT re-shot | **PASS** |
| music | PASS `:5189/` | PASS (8/8) | PASS (phone GET + JS chunks) | PASS launch | NOT re-shot | **PASS** |
| home | PASS `:5196/storage` | PASS (4/4) | PASS (phone GET `/storage`) | PASS launch | NOT re-shot | **PASS** |
| health | PASS `:5192/` | PASS (4/4) | PASS (phone GET + manifest) | PASS launch | NOT re-shot | **PASS** |
| plan | PASS `:5188/` | PASS (8/8) | PASS (phone GET + brand assets) | PASS launch | NOT re-shot | **PASS** |
| training | PASS `:5190/` | PASS (8/8) | PASS (phone GET + exercise image) | PASS launch | NOT re-shot | **PASS** |
| paper | PASS placeholder `:5219/spaces/paper` | n/a (honest stub) | PASS (phone GET `/spaces/paper`, no crash) | PASS launch | n/a | **PARTIAL** (expected) |

**Overall:** Continuity links usable on LAN after repair. Visual dual-dock / dock-pill UI not re-captured this round (screenshot tooling unavailable); prior `screenshots/*-home.png` + `*-return-kenos.png` retained from PASS_LAN smoke.

## 1. Static wiring / SSOT

Compared `apps/aios/src/lib/kenos/domainIntegration.core.js` ↔ `clients/apple/Apps/Shared/KenosDomainRegistry.swift`:

| Check | Result |
| ----- | ------ |
| Domain ids | Match: kenos, plan, training, work, money, library, music, home, health, paper |
| Ports | Match: 5219 / 5188 / 5190 / 5180 / 5879 / 5189 / 5196 / 5192 |
| homePaths | Match (`money`→`/home/today`, `home`→`/storage`, `work`→`/work`, `paper`→`/spaces/paper`) |
| Aliases finance→money, knowledge→library | Match in `DOMAIN_ALIASES` / Swift `aliases` map |
| Definition.aliases arrays (Swift) | **Was incomplete** vs JS — **fixed** this round |
| Shelf / Spaces catalog | HOSTED_SPACES includes plan, training, work, money, library(knowledge), music, home, health, paper(preparing) |
| Today shortcuts | health was missing — **added** |

Unit tests: `domainIntegration.core.test.js` + related kenos suites **131/131 pass** (`node --test src/lib/kenos/*.test.js`). Full `npm test -w aios-os` still has unrelated `workCommand.core.test.js` / contracts `.ts` import failure.

## 2. HTTP reachability (LAN)

### Found down at start of this check

| Port | App | State at 14:39Z |
| ---- | --- | --------------- |
| 5219 | aios | UP (launchd) |
| 5188 | planner | UP (launchd) |
| 5190 | fitness | UP (launchd; briefly contested by stray `node` on `127.0.0.1:5190`) |
| 5180 | finance | **DOWN** |
| 5879 | knowledge | **DOWN** |
| 5189 | music | **DOWN** |
| 5196 | home | **DOWN** |
| 5192 | health | **DOWN** |

Ad-hoc `serve-static.py` processes died when the agent shell exited — not durable.

### Fix applied

Extended `scripts/kenos-daily-beta/kenos-ctl.sh` to install **Continuity companion LaunchAgents** serving `apps/{finance,knowledge,music,home,health}/build` on `0.0.0.0`:

- `com.kenpan.kenos-daily-beta.finance` → `:5180`
- `com.kenpan.kenos-daily-beta.knowledge` → `:5879`
- `com.kenpan.kenos-daily-beta.music` → `:5189`
- `com.kenpan.kenos-daily-beta.home` → `:5196`
- `com.kenpan.kenos-daily-beta.health` → `:5192`

Ran: `kenos-ctl.sh install` → all eight origins **UP** on `10.20.202.15` with `?iosNativeShell=1` → **200**.

### Dock path matrix

All domain dock slot + More paths from SSOT returned **200** on LAN (see shell session). No 404s found.

## 3. Deep link / Continuity usability

Method: `xcrun devicectl device process launch --payload-url <Continuity URL>` then `kenos://return`.

Log: `logs/link-usability-launches.txt`

| Evidence | Result |
| -------- | ------ |
| Every domain home launch | `LAUNCH_OK` |
| Every `kenos://return` | `LAUNCH_OK` |
| Paper placeholder | `LAUNCH_OK` (no crash) |
| Phone fetches (`10.20.202.6`) | Confirmed on aios/work, finance, knowledge, music, home, health, planner, fitness |
| Fresh screenshots `screenshots/link-check-2026-07-21/` | **Unavailable** — `pymobiledevice3` not on PATH; `idevicescreenshot` needs DDI (`screenshotr` Invalid service) |

Honest downgrade: **UI dual-dock / single KenosMotion pill not pixel-reverified** this round. Functional Continuity (origin load + return launch + phone HTTP) **PASS**. Rely on prior smoke screenshots for chrome composition unless DDI re-mounted.

## 4. In-app navigation links

| Surface | Status |
| ------- | ------ |
| Spaces / HOSTED_SPACES deep links | Ports/paths resolve; knowledge bridge now launches as **Library** (`domainId=library`) |
| DomainLaunch unavailable copy | Was stale (“only Plan/Training”) — **fixed** to point at `kenos-ctl start` companions |
| Domain dock tabs | All SSOT paths 200 |
| Quick Switch / Continue | Registry stubs + shelf cards cover all shelf domains; no dead shelf domain id |
| Today shortcuts | Now includes health |

## 5. Embedded chrome

| App | `data-ios-native-shell` hide rules in build | Notes |
| --- | ------------------------------------------- | ----- |
| finance | present | BottomNav gated + CSS belt |
| knowledge | present | same |
| music | present | DomainMusicHeader in main |
| home | present | same |
| health | present | same |
| work (aios) | source hides chrome when nativeShell | phone loaded `/work?iosNativeShell=1` |

No chrome regression found in source/build markers this round. Visual dual-BottomNav check blocked by screenshot tooling.

## Broken links found → fixes

1. **Money/Library/Music/Home/Health Continuity dead on LAN** — companions not in launchd → **fixed in kenos-ctl**  
2. **Swift `Definition.aliases` incomplete** vs JS → **aligned**  
3. **DomainLaunch** still claimed Daily Beta only packs Plan/Training → **copy + library domainId fix**  
4. **Today shortcuts omitted health** → **added**  
5. **Fitness briefly DOWN** when stray Node listened on `127.0.0.1:5190` → reinstall/kickstart restored Python `*:5190`; avoid vite/preview on Continuity ports

## Ports restarted

| Action | Ports |
| ------ | ----- |
| Companion LaunchAgents installed | 5180, 5879, 5189, 5196, 5192 |
| Core agents re-kicked via `kenos-ctl install` | 5219, 5188, 5190 |

## Residual / honest gaps

1. Fresh device screenshots not captured (DDI / pymobiledevice3).  
2. Dual-dock visual acceptance remains tied to prior PASS_LAN image set.  
3. Companion servers require `apps/<id>/build` present; not snapshotted into Daily Beta release tarball.  
4. Paper remains PARTIAL / placeholder by design.  
5. Do not bind vite/preview to Continuity ports (5190 conflict observed).

## Artifacts

- `logs/link-usability-launches.txt`  
- `logs/link-usability-smoke.txt` (earlier launch attempt; screenshots failed)  
- Prior visual set: `screenshots/*-home.png`, `*-return-kenos.png`
