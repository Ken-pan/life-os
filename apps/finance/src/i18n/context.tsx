import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { intlLocale } from "./formatLocale";
import { getActiveLocale, setActiveLocale, t as translate, type TranslateParams } from "./translate";
import { clearAiTextCache } from "../lib/aiClient";
import {
  DEFAULT_LOCALE,
  isAppLocale,
  readStoredLocale,
  writeStoredLocale,
  type AppLocale,
} from "./types";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, params?: TranslateParams) => string;
  intlLocale: string;
};

const LocaleCtx = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
  onLocaleChange,
}: {
  children: ReactNode;
  /** 云端 locale；有值时覆盖 localStorage。 */
  initialLocale?: AppLocale | null;
  onLocaleChange?: (locale: AppLocale) => void;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    const initial =
      initialLocale && isAppLocale(initialLocale) ? initialLocale : readStoredLocale();
    setActiveLocale(initial);
    return initial;
  });

  useEffect(() => {
    if (initialLocale && isAppLocale(initialLocale) && initialLocale !== locale) {
      setLocaleState(initialLocale);
    }
  }, [initialLocale]);

  useEffect(() => {
    setActiveLocale(locale);
    writeStoredLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const prevLocaleRef = useRef(locale);
  useEffect(() => {
    if (prevLocaleRef.current !== locale) {
      clearAiTextCache();
      prevLocaleRef.current = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: AppLocale) => {
      setLocaleState(next);
      onLocaleChange?.(next);
    },
    [onLocaleChange]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: translate,
      intlLocale: intlLocale(locale),
    }),
    [locale, setLocale]
  );

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleCtx);
  if (!ctx) {
    return {
      locale: getActiveLocale(),
      setLocale: () => {},
      t: translate,
      intlLocale: intlLocale(getActiveLocale()),
    };
  }
  return ctx;
}

export { DEFAULT_LOCALE, type AppLocale, type TranslateParams };
