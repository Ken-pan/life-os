import { useEffect, useState } from "react";
import {
  applyResolvedTheme,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "../lib/themePreference";

export function useThemePreference(): [
  ThemePreference,
  (preference: ThemePreference) => void,
  ResolvedTheme,
] {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readThemePreference()));

  useEffect(() => {
    const nextResolved = resolveTheme(preference);
    setResolved(nextResolved);
    applyResolvedTheme(nextResolved);
    persistThemePreference(preference);
  }, [preference]);

  useEffect(() => {
    if (preference !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const nextResolved = resolveTheme("auto");
      setResolved(nextResolved);
      applyResolvedTheme(nextResolved);
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preference]);

  return [preference, setPreference, resolved];
}
