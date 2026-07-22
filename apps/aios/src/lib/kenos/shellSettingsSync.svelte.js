/**
 * iOS 壳 ↔ AIOS web 主题/语言双向同步。
 *
 * AIOS web 的 theme/locale 已随 aios.user_state 整包 LWW 跨设备同步;
 * 本模块把 iOS 原生壳(KenosShellSettingsStore)接进这条链路,使
 * 「Mac 改主题 → 云 → iOS 壳」与「iOS 壳设置改 → AIOS → 云」都成立。
 *
 * 三条路径:
 * 1. 启动对账:壳 updatedAt vs web settingsUpdatedAt,新的一方赢,镜像给输方。
 *    壳侧赢 → save()(bump 时间戳,随云推送);web 侧赢 → push 回壳。
 *    对账平局/壳无显式值 → 静默采壳值,不 bump(云端 LWW 照原时间戳裁决)。
 * 2. 运行中壳广播(用户在原生设置改)→ save() bump → 云推送。
 * 3. web 侧变化(设置页 / 云端拉取落地)→ $effect 镜像 push 回壳。
 *
 * 非 iOS 壳环境全程 no-op。
 */
import { browser } from '$app/environment'
import { SHELL_SETTINGS_EVENT } from '@life-os/platform-web/kenos-shell-settings'
import {
  isIosNativeShell,
  pullKenosShellSettings,
  pushKenosShellSettings,
} from './iosNativeShell.js'
import { S, applyShellSettingsSilently, applyTheme, save } from '$lib/state.svelte.js'

let installed = false

/** @param {unknown} raw @returns {'light'|'dark'|'auto'|null} */
function normTheme(raw) {
  const t = String(raw || '').toLowerCase()
  return t === 'light' || t === 'dark' || t === 'auto' ? t : null
}

/** @param {unknown} raw @returns {'zh'|'en'|null} */
function normLocale(raw) {
  const l = String(raw || '').toLowerCase()
  return l === 'zh' || l === 'en' ? l : null
}

/**
 * 壳快照 → 对 AIOS 设置的增量(空 = 无需变更)。
 * @param {{ theme?: string, resolvedLocale?: string }} snap
 */
function patchFromShell(snap) {
  /** @type {{ theme?: string, locale?: string }} */
  const patch = {}
  const theme = normTheme(snap.theme)
  if (theme && theme !== S.settings.theme) patch.theme = theme
  const locale = normLocale(snap.resolvedLocale)
  if (locale && locale !== S.settings.locale) patch.locale = locale
  return patch
}

/** @param {{ theme?: string, resolvedLocale?: string }} snap @param {boolean} bump */
function applyFromShell(snap, bump) {
  const patch = patchFromShell(snap)
  if (!Object.keys(patch).length) return
  if (bump) {
    Object.assign(S.settings, patch)
    save()
    applyTheme()
  } else {
    applyShellSettingsSilently(patch)
  }
}

async function reconcileOnBoot() {
  const snap = await pullKenosShellSettings()
  if (!snap?.ok) return
  // 壳还没有显式值的字段:用 web 当前值播种,别让默认值反灌 web
  /** @type {{ theme?: string, locale?: string }} */
  const seed = {}
  if (!snap.hasTheme) seed.theme = S.settings.theme
  if (!snap.hasLocale) seed.locale = S.settings.locale
  if (Object.keys(seed).length) void pushKenosShellSettings(seed)

  if (!snap.hasTheme && !snap.hasLocale) return
  const shellAt = Number(snap.updatedAt ?? 0)
  const webAt = Number(S.settings.settingsUpdatedAt ?? 0)
  if (shellAt > webAt) {
    applyFromShell(snap, true)
  } else if (webAt > shellAt) {
    void pushKenosShellSettings({
      theme: S.settings.theme,
      locale: S.settings.locale,
    })
  } else {
    applyFromShell(snap, false)
  }
}

/**
 * 从 initCloud 挂载一次(浏览器端)。返回清理函数(测试用)。
 */
export function installShellSettingsSync() {
  if (!browser || installed || !isIosNativeShell()) return () => {}
  installed = true

  void reconcileOnBoot()

  /** @param {Event} ev */
  const onShellEvent = (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail || {}
    // 运行中的广播 = 用户在原生设置(或其他 domain)主动改 → 算用户变更
    applyFromShell(detail, true)
  }
  window.addEventListener(SHELL_SETTINGS_EVENT, onShellEvent)

  // web → 壳镜像(设置页改动、云端拉取落地)
  let last = { theme: S.settings.theme, locale: S.settings.locale }
  const stopEffect = $effect.root(() => {
    $effect(() => {
      const theme = S.settings.theme
      const locale = S.settings.locale
      /** @type {{ theme?: string, locale?: string }} */
      const patch = {}
      if (theme !== last.theme) patch.theme = theme
      if (locale !== last.locale) patch.locale = locale
      last = { theme, locale }
      if (Object.keys(patch).length) void pushKenosShellSettings(patch)
    })
  })

  return () => {
    window.removeEventListener(SHELL_SETTINGS_EVENT, onShellEvent)
    stopEffect()
    installed = false
  }
}
