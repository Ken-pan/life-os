const CACHE = 'planos-__BUILD_ID__';
const PRECACHE = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-dark.svg', '/logo-mark.svg'];
const REMINDER_DB = 'planos_reminders';
const REMINDER_STORE = 'jobs';
const MISSED_WINDOW_MS = 60 * 60 * 1000;

/** @type {Map<string, ReturnType<typeof setTimeout>[]>} */
const pendingTimers = new Map();

function cancelJobs(id) {
  const jobs = pendingTimers.get(id);
  if (!jobs) return;
  jobs.forEach(clearTimeout);
  pendingTimers.delete(id);
}

function cancelAllJobs() {
  for (const id of [...pendingTimers.keys()]) cancelJobs(id);
}

function scheduleJob(id, delay, handler) {
  const jobs = pendingTimers.get(id) ?? [];
  const tid = setTimeout(handler, Math.max(0, delay));
  jobs.push(tid);
  pendingTimers.set(id, jobs);
}

async function showReminderNotification(title, taskId) {
  await self.registration.showNotification('PLANNER.OS 提醒', {
    body: title,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: `planos-reminder-${taskId}`,
    renotify: true,
    vibrate: [100, 50, 100],
    data: { url: '/', taskId }
  });
}

function openReminderDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REMINDER_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REMINDER_STORE)) {
        db.createObjectStore(REMINDER_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistJobs(jobs) {
  const db = await openReminderDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, 'readwrite');
    const store = tx.objectStore(REMINDER_STORE);
    store.clear();
    for (const job of jobs) store.put(job);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadPersistedJobs() {
  const db = await openReminderDb();
  const jobs = await new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, 'readonly');
    const req = tx.objectStore(REMINDER_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return jobs;
}

async function clearPersistedJobs() {
  const db = await openReminderDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, 'readwrite');
    tx.objectStore(REMINDER_STORE).clear();
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function scheduleReminderJobs(jobs) {
  cancelAllJobs();
  const now = Date.now();
  for (const job of jobs) {
    if (!job?.id || !job?.fireAt || !job?.title) continue;
    const delay = job.fireAt - now;
    if (delay <= 0) {
      if (now - job.fireAt < MISSED_WINDOW_MS) {
        showReminderNotification(job.title, job.id).catch(() => {});
      }
      continue;
    }
    scheduleJob(job.id, delay, () => {
      cancelJobs(job.id);
      showReminderNotification(job.title, job.id).catch(() => {});
    });
  }
}

async function reinstallRemindersFromDb() {
  try {
    const jobs = await loadPersistedJobs();
    if (jobs.length) scheduleReminderJobs(jobs);
  } catch {
    /* IDB unavailable */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => reinstallRemindersFromDb())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'CLEAR_REMINDERS') {
    cancelAllJobs();
    clearPersistedJobs().catch(() => {});
    return;
  }
  if (data.type === 'RESCHEDULE_REMINDERS') {
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    persistJobs(jobs)
      .catch(() => {})
      .finally(() => scheduleReminderJobs(jobs));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  const url = taskId ? `/?task=${encodeURIComponent(taskId)}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
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

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && url.pathname.startsWith('/_app/')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/')))
  );
});
