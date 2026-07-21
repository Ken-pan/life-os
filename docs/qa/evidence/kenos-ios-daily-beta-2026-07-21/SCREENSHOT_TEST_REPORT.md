# iOS Screenshot Test Report — 2026-07-21

## Scope

| Item | Value |
| --- | --- |
| Request | iOS 端截图测试 |
| Capture host | **iPhone 17 Pro Simulator** (iOS 26.4, UDID `9C0D270C-86DB-4462-B05A-CFA4F2D358A8`) |
| App | `space.kenos.app.ios` KenosIOS Debug |
| Shell origin (sim) | `http://127.0.0.1:5219` (Simulator ↔ Mac loopback) |
| Domain apps | `http://10.20.202.15:5188` / `:5190` (Safari open from shell) |
| Output | `docs/qa/evidence/kenos-ios-daily-beta-2026-07-21/screenshots/` |

## Real-device screenshot blockers (this run)

| Device | Kenos installed | Screenshot path | Result |
| --- | --- | --- | --- |
| Ken’s 17 Pro | YES | `idevicescreenshot` | FAIL — device only on CoreDevice wireless tunnel; not in `idevice_id` USB list |
| Ken’s iPhone 15 Pro | NO | USB `idevicescreenshot` | FAIL — `Could not start screenshotr service` + app not installable (No Accounts / profile missing 15 Pro) |

Simulator used for **visual surface capture only**. Does **not** replace real-device Daily Beta PASS.

## Canonical shots (content rendered)

| File | Surface | Notes |
| --- | --- | --- |
| `30-native-today.png` | Native shell → Today (WKWebView) | Today UI + Continue; shows 登录/读模型状态 |
| `30-native-assistant.png` | Assistant tab | Captured |
| `30-native-spaces.png` | Spaces tab | Domains list (Training / Work / Plan / Money / Music…) |
| `30-native-inbox.png` | Inbox tab | Captured / Needs review; honest auth-fail copy |
| `06-planner.png` | Planner OS | LAN `10.20.202.15` · Today empty-state |
| `07-fitness.png` | Fitness OS | LAN · 胸 day hero + cycle |
| `26-safari-loopback.png` | Safari AIOS Today | Confirms AIOS HTML/JS OK on loopback |

## Failed / blank shots (kept as evidence)

| File | Why blank |
| --- | --- |
| `01`–`05`, `10`, `12` (early) | Shell before loopback origin rebuild; or WebView not yet hydrated |
| `20`–`25` Safari → `10.20.202.15` (AIOS) | Address bar lost/hid `:5219`; blank page (Planner `:5188` / Fitness `:5190` still OK) |

## Visual findings

1. **Native chrome OK** — Continue / Switch Space toolbar + 4 tabs.
2. **Double bottom nav** — Web `BottomNav` + native `TabView` both visible (residual polish).
3. **Auth / read model** — UI shows「登录或权限失效」/「今日读模型尚未连接」(honest degraded, not fake empty zeros).
4. **Planner / Fitness** — Product UI loads over phone-reachable LAN IP from iOS.

## Repro

```bash
# Mac Daily Beta
export KENOS_STATIC_BIND=0.0.0.0
./scripts/kenos-daily-beta/kenos-ctl.sh restart

# Simulator build + shots
SIM=$(xcrun simctl list devices available | rg "iPhone 17 Pro \(" | rg -v Max | head -1 | rg -o '\([A-F0-9-]+\)' | tr -d '()')
cd clients/apple/Apps && xcodegen generate
xcodebuild -project Kenos.xcodeproj -scheme KenosIOS -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIM" -derivedDataPath ./build-sim \
  CODE_SIGNING_ALLOWED=NO KENOS_DAILY_BETA_ORIGIN=http://127.0.0.1:5219 build
xcrun simctl install "$SIM" ./build-sim/Build/Products/Debug-iphonesimulator/KenosIOS.app
xcrun simctl launch "$SIM" space.kenos.app.ios
sleep 12
xcrun simctl io "$SIM" screenshot /tmp/kenos-today.png
```

## Verdict for this screenshot pass

**SCREENSHOT PASS (Simulator)** — Today / Assistant / Spaces / Inbox / Planner / Fitness captured with readable UI.  
**REAL-DEVICE SCREENSHOT** — blocked (15 Pro signing; 17 Pro no USB screenshotr).  
**Not claiming IOS — PERSONAL DAILY BETA READY** from this alone.
