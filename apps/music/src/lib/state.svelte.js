import { browser } from '$app/environment';
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme
} from '@life-os/theme';

const SKEY = 'musicos_v1';

const defaultState = () => ({
  settings: {
    theme: 'auto',
    locale: 'zh',
    crossfade: false,
    gapless: true
  }
});

function load() {
  if (!browser) return defaultState();
  try {
    const raw = localStorage.getItem(SKEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...parsed.settings } };
  } catch {
    return defaultState();
  }
}

export const S = $state(load());

/** Bumped after background cover repair so list pages can reload. */
export const librarySignals = $state({ epoch: 0 });

export function bumpLibraryEpoch() {
  librarySignals.epoch += 1;
}

export function save() {
  if (!browser) return;
  localStorage.setItem(SKEY, JSON.stringify(S));
}

const THEME_APPLY_OPTIONS = {
  themeColorMetaId: 'theme-color-meta',
  themeColorFallback: { light: '#faf5f4', dark: '#100a0c' }
};

export function applyTheme() {
  if (!browser) return;
  applyResolvedTheme(resolveTheme(S.settings.theme, 'auto'), THEME_APPLY_OPTIONS);
}

export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'auto'
  );
}
