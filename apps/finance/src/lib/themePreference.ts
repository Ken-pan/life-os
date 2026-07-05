export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fos-theme";

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "auto";
}

export function readThemePreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "auto") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
  const themeMeta = document.getElementById("theme-color-meta");
  if (themeMeta) {
    themeMeta.setAttribute("content", resolved === "dark" ? "#101211" : "#f2f4f2");
  }
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function themePreferenceLabel(
  preference: ThemePreference,
  t: (key: string) => string
): string {
  if (preference === "light") return t("settings.themeLight");
  if (preference === "dark") return t("settings.themeDark");
  return t("settings.themeAuto");
}
