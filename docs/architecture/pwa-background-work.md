# PWA background-work pattern

How Life OS apps should keep working when the tab is hidden, the screen wants
to sleep, or a new deploy ships while the app is open. This consolidates
logic that used to be re-implemented (and slowly drifting) per app.

## Reality check: what the platform actually allows

As of 2026, iOS Safari (which is what most Life OS users are on, since these
are installed Home Screen PWAs) does **not** support:

- Background Sync API
- Periodic Background Sync API
- Background Fetch API

There is no announced timeline for iOS to add them. Push notifications and
the Wake Lock API _do_ work on iOS 16.4+/18.4+ Home Screen apps. This means:

- **Don't build features around Background Sync / Periodic Sync.** They'd
  silently no-op for most users. Chromium-only, installed-PWA-only, and even
  there it's a progressive enhancement at best — use it only as an addition
  to an in-page retry path, never as the only retry mechanism.
- **The reliable "background work" pattern on this stack is resume-on-foreground**:
  queue/track what needs to happen while hidden, then reconcile the moment the
  tab becomes visible again. This is already how `@life-os/sync`'s
  `bindVisibilitySync` and `@life-os/theme`'s `pwaResume.js` work — keep
  building on that, don't reach for sync APIs that won't fire.
- **Wake Lock is real and worth using** for any view where the user expects
  the screen to stay on without touching it (workout timer, now-playing view,
  a long read). See below.
- **Push notifications** (planner's reminders) work but need a real
  `PushManager` subscription + server-sent push to survive the SW being
  killed — the current `Notification`-permission + in-SW-`setTimeout` approach
  in planner only fires reminders while the SW process happens to be alive,
  which the OS can kill at any time. That's a known gap, not something this
  pattern fixes; tracked separately, not addressed by this change.

## Shared modules (`@life-os/platform-web`)

### `@life-os/platform-web/sw-lifecycle`

```js
import { registerServiceWorker } from '@life-os/platform-web/sw-lifecycle'
import { dev } from '$app/environment'

const cleanup = registerServiceWorker({
  enabled: !dev,
  // Optional: keep showing the old version while this is true, so an update
  // never interrupts something the user is mid-way through.
  shouldDeferUpdate: () => player.playing,
  // Optional: extra window events (beyond visibilitychange/focus) that should
  // re-check whether a deferred update can now be applied.
  deferEvents: ['musicos:playback-state'],
})
// onUnmount: cleanup()
```

Registers `/sw.js`, and manages the "a new version is waiting" lifecycle:
activating the waiting worker (and the page reload that follows) is deferred
while the tab is hidden or `shouldDeferUpdate()` is true, and applied on the
next visibility change, window focus, or `deferEvents` firing. This is what
prevents a deploy from yanking the page out from under someone mid-audio or
mid-form.

Used by music, home, planner, finance, fitness, and portal (portal defers
navigate failures to `/offline.html` because it is SSR). Each app keeps its own `static/sw.js`
(cache strategy, precache list, and — for planner — reminder/notification
handling — are genuinely per-app), but the _registration/update_ logic is
shared instead of hand-copied.

### `@life-os/platform-web/wake-lock`

```js
import { createScreenWakeLock } from '@life-os/platform-web/wake-lock'

const wakeLock = createScreenWakeLock()
const cleanup = wakeLock.bindWithGestureFallback() // some iOS versions need a user gesture for the first request()
// onUnmount: cleanup()
```

Wraps the Screen Wake Lock API: acquires on mount, re-acquires on
`visibilitychange`/`pageshow` (covers bfcache restores) and on unexpected
system release, releases on cleanup. Call `createScreenWakeLock()` once per
independent feature (e.g. once per timer), not as a shared singleton — two
unrelated features holding their own controller won't fight each other.

Currently used by fitness's workout timer / focus session. Good candidates
elsewhere: music's now-playing view, home's active CAD-edit session.

### `@life-os/platform-web/network-resume`

```js
import { bindNetworkResume } from '@life-os/platform-web/network-resume'

const cleanup = bindNetworkResume({
  onResume: () => scheduleBidirectionalSync(),
  shouldDefer: () => player.playing, // same defer semantics as SW updates
  when: () => Boolean(auth.user),
  skipWhenOffline: true, // default — skip foreground callback while offline
})
```

Combines `bindPwaForegroundResume` (viewport flush on return) with an
`online` listener so queued sync/reconcile work runs when network returns
**without** requiring the user to background the app. Used by music, fitness,
planner (sync), home, and finance AuthGate.

Call with no `onResume` to get viewport-only flush (music/finance root layouts).

### `@life-os/platform-web/app-badge`

```js
import { setAppBadgeCount } from '@life-os/platform-web/app-badge'

void setAppBadgeCount(overdueCount) // 0 clears
```

Shows a count on the installed-app icon (iOS 16.4+ Home Screen apps,
Chromium). Planner uses this for overdue-task count.

### `@life-os/platform-web/connectivity`

```js
import { isOnline, bindOnlineStatus } from '@life-os/platform-web/connectivity'
```

Lightweight online/offline helpers. Music's Svelte `$state` connectivity
module wraps `bindOnlineStatus` for UI banners.

### `@life-os/platform-web/persistent-storage`

```js
import { requestPersistentStorage } from '@life-os/platform-web/persistent-storage'
void requestPersistentStorage() // once, in the root layout's onMount
```

Asks the browser to protect the origin's storage (IndexedDB, Cache Storage,
localStorage) from eviction under disk pressure. Without it, Chrome/Firefox
may silently wipe local data — fatal for music's Dexie library and planner's
reminder jobs. iOS Home Screen apps are persisted implicitly (no-op there).
Best-effort and prompt-free in practice; all five apps call it on startup.

## Per-app `sw.js`: shared shape, not shared file

Every app's service worker follows the same shape — versioned cache name,
precache the app shell + icons + manifest, network-first with cache fallback
for same-origin GET, `SKIP_WAITING` message handling — but stays a plain file
in `apps/<app>/static/sw.js` rather than a generated/shared file, because SW
scripts run in an isolated worker context (no bundler, no npm imports) and
each app's precache list and any extra message-handling (planner's reminder
scheduling) genuinely differs. Copy the shape, not the file.

Cache-bust convention: the SW source contains a `__<APP>_BUILD_ID__` token;
a `closeBundle` Vite plugin (`apps/<app>/vite.config.js`) replaces it with
`COMMIT_REF`/`DEPLOY_ID`/a dev fallback at build time, so every deploy gets a
fresh cache instead of serving stale precached assets forever. See
`financePwaCacheVersionPlugin` in `apps/finance/vite.config.js` for the
reference implementation (mirrors music's `musicPwaCacheVersionPlugin`).

Netlify must not cache `sw.js` or `manifest.webmanifest` at the CDN/browser
level, or updates never reach clients — every app's `netlify.toml` sets:

```toml
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"
    Service-Worker-Allowed = "/"

[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Cache-Control = "no-cache, must-revalidate"
```

## Adding this to a new app

1. `apps/<app>/static/sw.js` — copy an existing minimal one (`apps/home/static/sw.js`
   is the simplest reference) and adjust the precache list to real asset paths.
2. `apps/<app>/vite.config.js` — add a `closeBundle` build-id plugin like
   `financePwaCacheVersionPlugin`, matching the `__<APP>_BUILD_ID__` token used
   in step 1.
3. Root `+layout.svelte` `onMount` — call `registerServiceWorker({ enabled: !dev })`
   from `@life-os/platform-web/sw-lifecycle` and return its cleanup.
4. `netlify.toml` — add the `sw.js`/`manifest.webmanifest`/`_app/immutable`
   header blocks shown above.
5. If the app has a view that should keep the screen awake, use
   `createScreenWakeLock()` from `@life-os/platform-web/wake-lock` instead of
   a bespoke implementation or a `NoSleep`-style hack.
6. Call `requestPersistentStorage()` from
   `@life-os/platform-web/persistent-storage` in the same `onMount`.
7. If the app syncs to cloud, prefer `bindNetworkResume()` from
   `@life-os/platform-web/network-resume` over hand-rolled
   `visibilitychange` + `online` listeners.

## Known gaps / next candidates

- **Portal offline scope** — SW shows `/offline.html` when navigate fails; login
  and app redirects still require network (by design for SSR launcher).
- **Planner push ops** — Web Push cron is implemented (`planner-reminder-push`
  Netlify scheduled function, every 5 min). Production **DB tables exist** (2026-07-12).
  Remaining ops (if enabling push):
  1. Generate keys: `node apps/planner/scripts/generate-vapid-keys.mjs`
  2. Set Netlify env: `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SERVICE_ROLE_KEY`
  Local in-SW `setTimeout` reminders remain as a Chromium progressive enhancement.
