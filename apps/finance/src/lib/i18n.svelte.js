// 端口自 src/i18n/context.tsx（React Context）→ Svelte 5 runes 模块。
// 与原 LocaleProvider 行为对齐：locale 状态 + 持久化 + document.lang + AI 文案缓存清理。
//
// 注：Svelte 5 不允许直接 `export` 一个会被重新赋值的 $state 原始值
// （见 https://svelte.dev/e/state_invalid_export）。因此 `locale` 以「读取函数」的
// 形式导出（与 `t` / `intlLocaleTag` 保持一致的写法），在响应式上下文（模板 / $derived /
// $effect）中调用 `locale()` 即可正确建立依赖追踪。
import { browser } from '$app/environment'
import { intlLocale } from '@life-os/finance-core/i18n/formatLocale'
import {
  getActiveLocale,
  setActiveLocale,
  t as translateMessage,
} from '@life-os/finance-core/i18n/translate'
import {
  DEFAULT_LOCALE,
  isAppLocale,
  readStoredLocale,
  writeStoredLocale,
} from '@life-os/finance-core/i18n/types'
import { clearAiTextCache } from './aiClient.js'

export { DEFAULT_LOCALE }

/** @type {import('@life-os/finance-core/i18n/types').AppLocale} */
let currentLocale = $state(readStoredLocale())

/** @type {((locale: import('@life-os/finance-core/i18n/types').AppLocale) => void) | null} */
let onLocaleChangeHandler = null

// 用独立的初始快照而非直接读 currentLocale，避免 Svelte 编译器把这里误判为
// 「只捕获了一次初始值」的响应式引用（这里本来就只需要模块加载时的一次快照）。
let prevLocale = readStoredLocale()

function applyLocaleSideEffects(next) {
  setActiveLocale(next)
  writeStoredLocale(next)
  if (browser) document.documentElement.lang = next
  if (prevLocale !== next) {
    clearAiTextCache()
    prevLocale = next
  }
}

/** 当前语言（读取函数：在响应式上下文中调用会建立依赖追踪）。 */
export function locale() {
  return currentLocale
}

/**
 * 初始化 locale：同步一次当前值的副作用，并（浏览器端）建立响应式 effect，
 * 使后续任何对 locale 的修改都会自动持久化 / 同步到 document / 清理 AI 缓存。
 *
 * @param {{
 *   initialLocale?: import('@life-os/finance-core/i18n/types').AppLocale | null,
 *   onLocaleChange?: (locale: import('@life-os/finance-core/i18n/types').AppLocale) => void,
 * }} [options] 云端 initialLocale 有值时覆盖 localStorage；onLocaleChange 用于持久化到云端。
 * @returns {() => void} 清理函数
 */
export function initLocale(options = {}) {
  const { initialLocale, onLocaleChange } = options
  onLocaleChangeHandler = onLocaleChange ?? null
  if (
    initialLocale &&
    isAppLocale(initialLocale) &&
    initialLocale !== currentLocale
  ) {
    currentLocale = initialLocale
  }
  applyLocaleSideEffects(currentLocale)

  if (!browser) return () => {}

  return $effect.root(() => {
    $effect(() => {
      applyLocaleSideEffects(currentLocale)
    })
  })
}

/** @param {import('@life-os/finance-core/i18n/types').AppLocale} next */
export function setLocale(next) {
  if (!isAppLocale(next) || next === currentLocale) return
  currentLocale = next
  onLocaleChangeHandler?.(next)
}

/** @param {string} key @param {import('@life-os/finance-core/i18n/translate').TranslateParams} [params] */
export function t(key, params) {
  // 读取 currentLocale（$state）建立响应式依赖，再委托给 finance-core 的全局 translate()。
  setActiveLocale(currentLocale)
  return translateMessage(key, params)
}

/** Intl 日期/排序用的 BCP 47 标签（随 locale 响应式更新）。 */
export function intlLocaleTag() {
  return intlLocale(currentLocale)
}

export { getActiveLocale }
