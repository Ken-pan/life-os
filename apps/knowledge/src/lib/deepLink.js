/**
 * KnowledgeOS 原生深链：`knowledgeos://open?title=…` → `/library?title=…`
 * 仅 Tauri 壳内生效；web 构建无插件时静默跳过。
 */
import { goto } from '$app/navigation'
import { knowledgePathFromNativeUrl } from '@life-os/platform-web/wikilinks'
import { isTauri } from '$lib/vault.js'

/**
 * @param {string | string[] | null | undefined} urls
 */
export function navigateFromDeepLinkUrls(urls) {
  const list = Array.isArray(urls) ? urls : urls ? [urls] : []
  for (const raw of list) {
    const path = knowledgePathFromNativeUrl(raw)
    if (path) {
      void goto(path)
      return true
    }
  }
  return false
}

/** @returns {Promise<() => void>} unsubscribe */
export async function bindKnowledgeDeepLinks() {
  if (!isTauri()) return () => {}
  try {
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
    const initial = await getCurrent().catch(() => null)
    if (initial?.length) navigateFromDeepLinkUrls(initial)
    const unlisten = await onOpenUrl((urls) => {
      navigateFromDeepLinkUrls(urls)
    })
    return typeof unlisten === 'function' ? unlisten : () => {}
  } catch {
    return () => {}
  }
}
