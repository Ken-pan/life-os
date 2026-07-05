import { resolveTheme, isThemePreference } from './themePreference';

describe('themePreference', () => {
  it('accepts light, dark, auto', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('auto')).toBe(true);
    expect(isThemePreference('system')).toBe(false);
  });

  it('resolves explicit preferences', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
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
    expect(resolveTheme('auto')).toBe('dark');
  });
});
