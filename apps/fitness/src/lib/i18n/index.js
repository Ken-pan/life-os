import { browser } from '$app/environment';
import { S, save } from '$lib/state.svelte.js';
import { messages } from './messages/index.js';

/** @typedef {typeof import('./messages/zh.js').default} Messages */

const LOCALES = /** @type {const} */ (['zh', 'en']);

/** @param {string} [locale] */
export function resolveLocale(locale) {
  return LOCALES.includes(locale) ? locale : 'zh';
}

/** BCP 47 tag for Intl APIs */
export function localeTag() {
  return resolveLocale(S.settings.locale) === 'en' ? 'en-US' : 'zh-CN';
}

function lookup(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

/**
 * Translate a dot-path key. Reads S.settings.locale for reactivity in $derived.
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function t(key, params = {}) {
  const locale = resolveLocale(S.settings.locale);
  let str = lookup(messages[locale], key) ?? lookup(messages.zh, key) ?? key;
  if (typeof str !== 'string') return key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

export function applyLocale() {
  if (!browser) return;
  const locale = resolveLocale(S.settings.locale);
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.documentElement.dataset.locale = locale;
}

/** @param {'zh' | 'en'} locale */
export function setLocale(locale) {
  S.settings.locale = resolveLocale(locale);
  save();
  applyLocale();
}
