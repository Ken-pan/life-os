const CACHE = 'fitos-v7';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon-16.png',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/notify-192.png',
  '/brand-circle-dark-48.png',
  '/brand-circle-dark-96.png',
  '/brand-circle-light-48.png',
  '/brand-circle-light-96.png',
  '/assets/images/exercises/c_bench.jpg',
  '/assets/images/exercises/c_incdb.jpg',
  '/assets/images/exercises/c_incmc.jpg',
  '/assets/images/exercises/c_decmc.jpg',
  '/assets/images/exercises/c_fly.jpg',
  '/assets/images/exercises/ar_dip.jpg',
  '/assets/images/exercises/b_pull.jpg',
  '/assets/images/exercises/b_pulldown.jpg',
  '/assets/images/exercises/b_row.jpg',
  '/assets/images/exercises/b_1arm.jpg',
  '/assets/images/exercises/b_seal.jpg',
  '/assets/images/exercises/b_ext.jpg',
  '/assets/images/exercises/b_face.jpg',
  '/assets/images/exercises/ar_bbcurl.jpg',
  '/assets/images/exercises/ar_pushdn.jpg',
  '/assets/images/exercises/ar_preacher.jpg',
  '/assets/images/exercises/ar_skull.jpg',
  '/assets/images/exercises/ar_hammer.jpg',
  '/assets/images/exercises/ar_rope.jpg',
  '/assets/images/exercises/ar_cablecurl.jpg',
  '/assets/images/exercises/l_squat.jpg',
  '/assets/images/exercises/l_hack.jpg',
  '/assets/images/exercises/l_press.jpg',
  '/assets/images/exercises/l_ext.jpg',
  '/assets/images/exercises/l_curl.jpg',
  '/assets/images/exercises/l_thrust.jpg',
  '/assets/images/exercises/l_abd.jpg',
  '/assets/images/exercises/co_hlr.jpg',
  '/assets/images/exercises/co_cablecrunch.jpg',
  '/assets/images/exercises/co_rollout.jpg',
  '/assets/images/exercises/co_woodchop.jpg',
  '/assets/images/exercises/co_plank.jpg'
];

/** @type {Map<string, ReturnType<typeof setTimeout>[]>} */
const pendingTimers = new Map();

function cancelTimerJobs(id) {
  const jobs = pendingTimers.get(id);
  if (!jobs) return;
  jobs.forEach(clearTimeout);
  pendingTimers.delete(id);
}

function addTimerJob(id, delay, handler) {
  const jobs = pendingTimers.get(id) ?? [];
  const tid = setTimeout(handler, Math.max(0, delay));
  jobs.push(tid);
  pendingTimers.set(id, jobs);
  return tid;
}

async function postToClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(message));
}

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page decides when the new version may take over
  // (via a SKIP_WAITING message), so an update never lands mid-timer.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const { type, id, endAt, name, mode, sound, notify, countdown } = data;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'CANCEL_TIMER') {
    if (id) cancelTimerJobs(id);
    return;
  }

  if (type !== 'SCHEDULE_TIMER' || !id || !endAt) return;

  cancelTimerJobs(id);

  const now = Date.now();
  const remainSec = Math.max(0, Math.ceil((endAt - now) / 1000));

  if (countdown && mode === 'rest' && sound !== false) {
    if (remainSec > 10) {
      addTimerJob(id, endAt - now - 10000, () => {
        postToClients({ type: 'TIMER_CUE', id, cue: 'warn10' });
      });
    }
    for (let s = 5; s >= 1; s--) {
      if (remainSec >= s) {
        addTimerJob(id, endAt - now - s * 1000, () => {
          postToClients({ type: 'TIMER_CUE', id, cue: s });
        });
      }
    }
  }

  const doneDelay = endAt - now;
  const promise = new Promise((resolve) => {
    addTimerJob(id, doneDelay, async () => {
      cancelTimerJobs(id);
      try {
        if (notify !== false) {
          await showTimerNotification(name, sound, mode);
        }
        await postToClients({ type: 'TIMER_DONE', id });
      } catch {
        /* 通知失败时静默 */
      }
      resolve();
    });
  });

  event.waitUntil(promise);
});

async function showTimerNotification(name, sound, mode = 'rest') {
  const isWork = mode === 'work';
  const title = isWork ? '动作计时结束' : '休息结束';
  const body = name
    ? `${name} · ${isWork ? '时间到' : '可以开始下一组了'}`
    : isWork
      ? '时间到'
      : '可以开始下一组了';

  await self.registration.showNotification(title, {
    body,
    icon: '/notify-192.png',
    badge: '/notify-192.png',
    tag: isWork ? 'fitos-work-timer' : 'fitos-rest-timer',
    renotify: true,
    silent: sound === false,
    vibrate: sound !== false ? [120, 60, 120, 60, 120] : undefined,
    timestamp: Date.now(),
    data: { url: '/' }
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
