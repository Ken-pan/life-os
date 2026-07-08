export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fos-theme";

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "auto";
}

// 读取/解析/应用/持久化逻辑已迁移至 @life-os/platform-web 的
// createThemePreferenceStoreWeb（见 hooks/useThemePreference.ts）。

export function themePreferenceLabel(
  preference: ThemePreference,
  t: (key: string) => string
): string {
  if (preference === "light") return t("settings.themeLight");
  if (preference === "dark") return t("settings.themeDark");
  return t("settings.themeAuto");
}
