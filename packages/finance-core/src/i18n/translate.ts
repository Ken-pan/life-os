import { MESSAGES, type MessageTree } from "./messages";
import { DEFAULT_LOCALE, type AppLocale } from "./types";

export type TranslateParams = Record<string, string | number>;

let activeLocale: AppLocale = DEFAULT_LOCALE;

export function setActiveLocale(locale: AppLocale): void {
  activeLocale = locale;
}

export function getActiveLocale(): AppLocale {
  return activeLocale;
}

function resolvePath(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let cur: MessageTree | string | undefined = tree;
  for (const part of parts) {
    if (typeof cur !== "object" || cur == null) return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? `{${name}}` : String(value);
  });
}

export function t(key: string, params?: TranslateParams): string {
  const primary = resolvePath(MESSAGES[activeLocale], key);
  if (primary != null) return interpolate(primary, params);
  const fallback = resolvePath(MESSAGES[DEFAULT_LOCALE], key);
  if (fallback != null) return interpolate(fallback, params);
  return key;
}

/** 扁平化消息树，供一致性测试使用。 */
export function flattenMessageKeys(tree: MessageTree, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") keys.push(path);
    else keys.push(...flattenMessageKeys(v, path));
  }
  return keys.sort();
}
