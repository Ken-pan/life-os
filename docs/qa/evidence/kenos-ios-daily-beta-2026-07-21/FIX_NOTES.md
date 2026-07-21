# iOS Daily Beta — Fix Notes (2026-07-21)

## Problems (from screenshot pass)

1. **Double bottom nav** — Web `BottomNav` + native `TabView`
2. **Blank AIOS on LAN IP** — iOS 17 ATS blocks HTTP to raw IPs unless exception domains/CIDR set ([Apple docs](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking))
3. **Domain links hardcode `127.0.0.1`** — unreachable on iPhone; Continue/Plan/Training opened loopback
4. **Blank WKWebView recovery** — content process kill with no reload ([Embrace](https://embrace.io/blog/bug-of-the-month-blank-webviews/))

## Fixes shipped

| Area | Change |
| --- | --- |
| ATS | `NSExceptionDomains` for `127.0.0.1`, `localhost`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12` + local networking |
| Dual nav | `window.__KENOS_IOS_NATIVE_SHELL__` + `?iosNativeShell=1` → hide web BottomNav / SystemBar |
| Domain origin | `localDailyBetaHost()` uses `window.location.hostname` (LAN IP on phone) |
| Resume | Accept private LAN + known ports; rewrite loopback→page host on open |
| WKWebView | UserScript inject, process-terminate reload, fail retry, loopback rewrite on external open |

## Verify shots

- `screenshots/40-fix-native-today.png`
- `screenshots/40-fix-native-spaces.png`

## Residual

- 「登录或权限失效」 on Today/Inbox is **honest** local-first unread cloud state (not a fake empty). Owner signs in once inside WebView for cloud reads.
- Real-device install on **15 Pro** still needs Xcode Accounts device registration.
