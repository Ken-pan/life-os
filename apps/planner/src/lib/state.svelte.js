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
  mergeTasksByUpdatedAt,
  mergeListsByUpdatedAt,
  mergeSettingsByUpdatedAt
} from './persist/migrate.js';
import { loadState, saveState } from './persist/localStore.js';

export { SCHEMA_VERSION, dateKeyOf, todayKey, uid, migrate, migrateTask, mergeTasksByUpdatedAt };

export const S = $state(loadState());

/** @type {(() => void) | null} 本地数据变更监听（sync 层注册，用于自动上云） */
let mutationListener = null;

/** @param {() => void} fn */
export function onStateMutation(fn) {
  mutationListener = fn;
  return () => {
    if (mutationListener === fn) mutationListener = null;
  };
}

export function save() {
  scheduleSave();
}

let saveTimer = null;

export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
  mutationListener?.();
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
    S.lists = mergeListsByUpdatedAt(S.lists, data.lists);
  }
  if (data.settings) {
    S.settings = mergeSettingsByUpdatedAt(S.settings, data.settings);
  }
}

/** 修改设置的统一入口：打上 updatedAt，跨设备 LWW 才能正确收敛 */
/** @param {Partial<import('./types.js').AppSettings>} patch */
export function updateSettings(patch) {
  S.settings = { ...S.settings, ...patch, updatedAt: Date.now() };
  save();
}

export function getListById(id) {
  return S.lists.find((l) => l.id === id && !l.deletedAt);
}

export function userLists() {
  return S.lists
    .filter((l) => !l.system && !l.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 未删除的清单（含系统清单），供选择器/侧边栏使用 */
export function visibleLists() {
  return S.lists.filter((l) => !l.deletedAt);
}

export function exportPayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: JSON.parse(JSON.stringify(S.tasks)),
    lists: JSON.parse(JSON.stringify(S.lists)),
    settings: JSON.parse(JSON.stringify(S.settings))
  };
}
