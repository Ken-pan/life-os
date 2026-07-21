# iOS Daily Beta — Fix Notes (2026-07-21)

## Problems (from screenshot pass)

1. **Double bottom nav** — Web `BottomNav` + native `TabView`
2. **Blank AIOS on LAN IP** — iOS 17 ATS blocks HTTP to raw IPs unless exception domains/CIDR set ([Apple docs](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking))
3. **Domain links hardcode `127.0.0.1`** — unreachable on iPhone; Continue/Plan/Training opened loopback
4. **Blank WKWebView recovery** — content process kill with no reload ([Embrace](https://embrace.io/blog/bug-of-the-month-blank-webviews/))
5. **Misleading auth copy** — 「登录或权限失效」 sounded like a broken session when the user simply had not signed in yet
6. **Shell deep links only switched tabs** — `payload-url` / `onOpenURL` for `/settings` did not load that path in WKWebView (blocked Continue-style in-shell resume)

## Fixes shipped

| Area | Change |
| --- | --- |
| ATS | `NSExceptionDomains` for `127.0.0.1`, `localhost`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12` + local networking |
| Dual nav | `window.__KENOS_IOS_NATIVE_SHELL__` + `?iosNativeShell=1` → hide web BottomNav / SystemBar |
| Domain origin | `localDailyBetaHost()` uses `window.location.hostname` (LAN IP on phone) |
| Resume | Accept private LAN + known ports; rewrite loopback→page host on open |
| WKWebView | UserScript inject, process-terminate reload, fail retry, loopback rewrite on external open |
| Auth UX | `ReadSourceState` / capability copy →「需要登录」+「去设置登录」CTA (`/settings`) |
| Shell deep link | `dailyBetaPathByTab` + `handleHTTPOpen` loads exact same-origin path in matching tab |

## Verify shots

- `screenshots/40-fix-native-today.png`
- `screenshots/40-fix-native-spaces.png`

## Continue deep-link smoke (access logs, pre deep-link-native fix)

Evidence: `logs/continue-deep-resume-summary.json`

| Target | Result |
| --- | --- |
| Planner `/` + `/schedule` | **PASS** — phone `10.20.202.6` fetched Planner assets |
| Fitness `/` | **PASS** — phone fetched Fitness + exercise images |
| AIOS `/settings` via payload-url | **PARTIAL** — launch OK but only `/?iosNativeShell=1` hit (tab switch only). Fix built; **pending install** on unlocked 17 Pro |

## Residual / install gate (this slice)

- Auth copy + CTA are live on Mac LAN Web shell (hot-patched release).
- Native deep-link fix: **BUILD SUCCEEDED** (`generic/platform=iOS`, build number in `~/.kenos-daily-beta/ios-build-number.txt`) but:
  - **17 Pro** went `unavailable` (wireless) during install window
  - **15 Pro** wired/`connected` but still **not in provisioning profile** (Xcode Accounts empty)
- Owner signs in once inside Web `/settings` for cloud reads (honest empty until then).
