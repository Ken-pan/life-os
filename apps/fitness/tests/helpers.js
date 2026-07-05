/** @param {import('@playwright/test').Page} page */
export function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @param {import('@playwright/test').Page} page */
export async function seed(page, data = {}) {
  await page.goto('/');
  await page.evaluate((d) => {
    const today = new Date();
    const todayK = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const s = JSON.parse(localStorage.getItem('fitos_v2') || '{}');
    s.settings = {
      unit: 'lbs',
      logDetail: 'quick',
      theme: 'dark',
      sound: true,
      notifyRest: false,
      plateCollarLbs: 0,
      plateCollarKg: 0,
      ...d.settings
    };
    s.weights = { c_bench: 185, c_incline: 135, c_fly: 0, b_row: 135, ...d.weights };
    if (d.logs) s.logs = d.logs;
    if (d.rotation) s.rotation = { next: 0, history: [], lastDeload: null, ...d.rotation };
    if (d.sessionMeta) s.sessionMeta = d.sessionMeta;
    if (d.programOverrides) s.programOverrides = d.programOverrides;
    delete s.focusCursor;

    s.sessionMeta = s.sessionMeta || {};
    s.rotation = s.rotation || { next: 0, history: [], lastDeload: null };
    s.rotation.history = s.rotation.history || [];
    for (const key of Object.keys(s.logs || {})) {
      const [date, dayId] = key.split('|');
      if (!date || !dayId || date >= todayK) continue;
      const ts = new Date(`${date}T12:00:00`).toISOString();
      if (!s.sessionMeta[key]) s.sessionMeta[key] = { startedAt: ts, endedAt: ts };
      else if (!s.sessionMeta[key].endedAt) s.sessionMeta[key].endedAt = s.sessionMeta[key].startedAt || ts;
      if (!s.rotation.history.some((h) => h.date === date && h.dayId === dayId)) {
        s.rotation.history.push({ date, dayId });
      }
    }
    s.rotation.history.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem('fitos_v2', JSON.stringify(s));
  }, data);
  await page.reload();
}
