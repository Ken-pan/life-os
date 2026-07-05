import { browser } from '$app/environment';
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme
} from '@life-os/theme';
import {
  SCHEMA_VERSION,
  dateKeyOf,
  todayKey,
  uid,
  migrate,
  migrateTask,
  mergeTasksByUpdatedAt
} from './persist/migrate.js';
import { loadState, saveState } from './persist/localStore.js';

export { SCHEMA_VERSION, dateKeyOf, todayKey, uid, migrate, migrateTask, mergeTasksByUpdatedAt };

export const S = $state(loadState());

export function save() {
  scheduleSave();
}

let saveTimer = null;

export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}

export function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  saveState(S);
}

/** Life OS 统一主题选项（与 FinanceOS / FitnessOS 对齐） */
export const THEME_APPLY_OPTIONS = {
  themeColorMetaId: 'theme-color-meta',
  faviconId: 'app-favicon',
  faviconLight: '/icon.svg',
  faviconDark: '/icon-dark.svg',
  themeColorFallback: { light: '#f5f3f0', dark: '#121110' }
};

/** @returns {'light'|'dark'} */
export function resolveAppTheme() {
  return resolveTheme(S.settings.theme, 'auto');
}

export function applyTheme() {
  if (!browser) return;
  applyResolvedTheme(resolveAppTheme(), THEME_APPLY_OPTIONS);
}

/** @returns {() => void} */
export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'auto'
  );
}

/** @param {import('./types.js').AppState['settings'] & Partial<import('./types.js').AppState>} data @param {'replace'|'merge'} [mode] */
export function applyState(data, mode = 'replace') {
  if (mode === 'replace') {
    const next = migrate(data);
    S.tasks = next.tasks;
    S.lists = next.lists;
    S.settings = next.settings;
    S.schemaVersion = next.schemaVersion;
    return;
  }
  if (Array.isArray(data.tasks)) {
    S.tasks = mergeTasksByUpdatedAt(S.tasks, data.tasks);
  }
  if (Array.isArray(data.lists)) {
    const byId = new Map(S.lists.map((l) => [l.id, l]));
    for (const l of data.lists) byId.set(l.id, l);
    S.lists = [...byId.values()];
  }
  if (data.settings) S.settings = { ...S.settings, ...data.settings };
}

export function getListById(id) {
  return S.lists.find((l) => l.id === id);
}

export function userLists() {
  return S.lists.filter((l) => !l.system).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function exportPayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: JSON.parse(JSON.stringify(S.tasks)),
    lists: JSON.parse(JSON.stringify(S.lists)),
    settings: JSON.parse(JSON.stringify(S.settings))
  };
}
