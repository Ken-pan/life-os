import { createThemePreferenceStoreWeb } from '@life-os/platform-web';
import { isThemePreference, THEME_STORAGE_KEY } from './themePreference';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('themePreference', () => {
  it('accepts light, dark, auto', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('auto')).toBe(true);
    expect(isThemePreference('system')).toBe(false);
  });

  it('shared store reads legacy fos-theme values unchanged', () => {
    for (const legacy of ['light', 'dark', 'auto'] as const) {
      const store = createThemePreferenceStoreWeb({
        storageKey: THEME_STORAGE_KEY,
        storage: memoryStorage({ [THEME_STORAGE_KEY]: legacy }),
        apply: false,
      });
      expect(store.getWebPreference()).toBe(legacy);
      store.destroy();
    }
  });

  it('shared store persists web values (auto, not system) for backward compat', () => {
    const storage = memoryStorage();
    const store = createThemePreferenceStoreWeb({
      storageKey: THEME_STORAGE_KEY,
      storage,
      apply: false,
    });
    store.setPreference('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    store.setPreference('system');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('auto');
    expect(isThemePreference(storage.getItem(THEME_STORAGE_KEY))).toBe(true);
    store.destroy();
  });

  it('resolves explicit preferences', () => {
    const store = createThemePreferenceStoreWeb({
      storageKey: THEME_STORAGE_KEY,
      storage: memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }),
      apply: false,
    });
    expect(store.getResolvedTheme()).toBe('dark');
    store.destroy();
  });

  it('resolves auto from prefers-color-scheme', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    });
    const store = createThemePreferenceStoreWeb({
      storageKey: THEME_STORAGE_KEY,
      storage: memoryStorage({ [THEME_STORAGE_KEY]: 'auto' }),
      apply: false,
    });
    expect(store.getResolvedTheme()).toBe('dark');
    store.destroy();
  });
});
