import { useCallback, useEffect, useState } from "react";
import {
  createThemePreferenceStoreWeb,
  fromWebThemePreference,
} from "@life-os/platform-web";
import {
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "../lib/themePreference";

// 模块级单例：StrictMode 双挂载下 matchMedia 监听也只绑一次。
// 存储值保持 web 形态（'auto'，非 contracts 的 'system'），fos-theme 键不迁移。
const themeStore = createThemePreferenceStoreWeb({
  storageKey: THEME_STORAGE_KEY,
  themeOptions: {
    // Finance 未定义 --theme-color CSS 变量，fallback 即原实现的固定色值
    themeColorFallback: { light: "#f2f4f2", dark: "#101211" },
  },
});

export function useThemePreference(): [
  ThemePreference,
  (preference: ThemePreference) => void,
  ResolvedTheme,
] {
  const [snapshot, setSnapshot] = useState(() => ({
    preference: themeStore.getWebPreference(),
    resolved: themeStore.getResolvedTheme(),
  }));

  useEffect(
    () =>
      themeStore.subscribe(({ webPreference, resolved }) => {
        setSnapshot({ preference: webPreference, resolved });
      }),
    [],
  );

  const setPreference = useCallback((preference: ThemePreference) => {
    themeStore.setPreference(fromWebThemePreference(preference));
  }, []);

  return [snapshot.preference, setPreference, snapshot.resolved];
}
