# Fix: 500 Internal Error on iPhone LAN Daily Beta

## Root cause
1. `http://10.20.202.15:5219` is **not** a secure context → `crypto.randomUUID` missing → SvelteKit boot crash → page title **Internal Error / 500**.
2. Amplifying: Python static server `request_queue_size` default 5 → WKWebView parallel chunk storm → TCP RST (also looked like flaky loads).

## Fix applied
1. Polyfill `crypto.randomUUID` in `apps/aios/src/app.html` + hot-patched live Daily Beta `index.html` (aios/planner/fitness).
2. `serve-static.py`: `request_queue_size=256`, swallow reset/broken-pipe, no SPA-fallback for `/_app/*`.

## Verify
- Playwright LAN `/?iosNativeShell=1` → **Today · Kenos Assistant** (not Internal Error).
- Parallel chunk storm 60/60 OK on aios LAN.
