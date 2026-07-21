# Screenshot Audit Round — 2026-07-21 (strict)

## Scope

| Item              | Value                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Prior canonical   | `30-*` / `40-fix-*`                                                                                          |
| New audit set     | `50-audit-*` (native Today), `54-mobile-*` (iPhone 13 viewport + `iosNativeShell=1`)                         |
| Contaminated      | `51-*` / `52-*` — blocked by iOS `Open in "Kenos"?` from `simctl openurl` (automation artifact, not product) |
| Real-device pixel | Still blocked (17 Pro wireless offline; 15 Pro signing)                                                      |

## Defects found → research → fix

| #   | Defect (from shots)                                     | Web research                                                                      | Fix                                                                                |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | --- |
| 1   | Double bottom nav (web + native) on `30-*`              | Hide web chrome when native TabView owns IA; persist shell flag across SPA nav    | `iosNativeShell` + `sessionStorage`; CSS belt; `hideGlobalNav`                     |
| 2   | 「登录或权限失效」+「这是正常状态」冲突                 | Auth empty ≠ true empty                                                           | Copy →「需要登录」/「登录后查看今日摘要」+ CTA                                     |
| 3   | WKWebView safe-area / inset flash                       | Tauri/Capacitor: `contentInsetAdjustmentBehavior = .never` + `viewport-fit=cover` | Set `.never` in `KenosWebSurfaceView`                                              |
| 4   | Toolbar gray empty pills (iOS 26 Liquid Glass)          | SO/Apple: toolbar glass blanks some glyphs                                        | Explicit `Label` + stable SF Symbols (`clock.arrow.circlepath`, `square.grid.2x2`) |
| 5   | `/settings` CTA lands on AI gateway, cloud login buried | UX: auth path must be first                                                       | Move **云端同步** to top of Settings; CTA → `/settings#cloud`                      |
| 6   | Shell deep link only switched tabs                      | Continue / payload-url need exact path                                            | `dailyBetaPathByTab` + `kenos://spaces                                             | settings | …`  |

## Pass criteria (this round)

| Check                                     | Result               | Evidence                                                           |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| No web BottomNav under `iosNativeShell=1` | **PASS**             | Playwright `bottomNavVisible=false` on Today/Spaces/Inbox/Settings |
| Auth copy honest, no「权限失效」          | **PASS**             | `50-audit-today.png`, `54-mobile-today.png`                        |
| No conflicting「正常状态」when unsigned   | **PASS**             | 「登录后查看今日摘要」                                             |
| Inbox uses — not fake zero                | **PASS**             | `54-mobile-inbox.png`                                              |
| Spaces list readable, single composition  | **PASS**             | `54-mobile-spaces.png`                                             |
| Settings cloud login first                | **PASS** (after fix) | `54-mobile-settings-cloud-top.png`                                 |
| Real-device native reinstall              | **HOLD**             | Device/signing gate unchanged                                      |

## Verdict

**SCREENSHOT AUDIT: FIXES SHIPPED + RE-VERIFIED (Simulator / mobile web shell).**
Does **not** flip `IOS — PERSONAL DAILY BETA READY` (still need unlocked 17 Pro for FLOW A/B, or Xcode Accounts + 15 Pro UDID). Auth already PASS — not an owner-login blocker.

Mac Web Daily Beta remains **READY**. Overall remains **HOLD**.
