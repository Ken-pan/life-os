# OWNER ACTION REQUIRED (single)

Unlock is complete. Install/launch/LAN smoke for Today / Spaces / Inbox / Settings / Planner / Fitness / force-quit / offline recovery are **PASS** on Ken’s **17 Pro**.

Auth inspection of WKWebView LocalStorage found **no** `sb-*-auth-token` session (only SDK string literals in network cache).

## Do this one thing

在 **Ken’s 17 Pro** 上打开已前台的 Kenos → **设置 → 云端同步**，用 Life OS 账号登录一次，保持屏幕亮起约 30 秒。

完成后说「已登录」，agent 会立刻复验 Auth → Continue Plan/Training → 收口 READY。

```
IOS — NOT READY
LAST SUCCESSFUL STEP: unlocked real-device shell + Planner/Fitness LAN Continuity + lifecycle/offline recovery
BLOCKER TYPE: product (Auth session missing on device WebView)
FAILED ASSERTION: AUTH persistence / Supabase session present in WKWebView storage
OWNER ACTION REQUIRED: 在 Kenos → 设置 → 云端同步 登录 Life OS 账号一次
MAC WEB FALLBACK: AVAILABLE
DATA SAFETY: SAFE
```
