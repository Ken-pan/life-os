/**
 * Spaces page list construction — hosted AIOS routes + external KENOS_SPACES.
 * listKey is namespaced so same space.id across namespaces never collide in {#each}.
 */
import { KENOS_SPACES } from './controlCenter.core.js'

export const HOSTED_SPACES = Object.freeze([
  {
    id: 'training',
    label: 'Training',
    detail: '训练 Focus：隐藏全局导航，延期跨域打扰',
    href: '/spaces/training',
  },
  {
    id: 'work-focus',
    label: 'Work · Deep Work',
    detail: '进入当前项目专注；也可打开完整 Work hub',
    href: '/spaces/work',
  },
  {
    id: 'work',
    label: 'Work hub',
    detail: '项目、交付、会议与决定',
    href: '/work',
  },
])

/**
 * @param {'hosted' | 'external' | string} namespace
 * @param {string} id
 */
export function spaceListKey(namespace, id) {
  return `${namespace}:${id}`
}

/**
 * Ensure listKeys are unique for Svelte {#each} keys.
 * On collision: console.warn (key only, no secrets), then append `#n` disambiguator.
 * Full list is always returned — never silently deduped.
 *
 * @param {Array<{ listKey: string } & Record<string, unknown>>} items
 * @param {{ warn?: (...args: unknown[]) => void }} [options]
 */
export function assignUniqueListKeys(items, { warn = console.warn } = {}) {
  const seen = new Map()
  return items.map((item) => {
    const baseKey = item.listKey
    const count = (seen.get(baseKey) ?? 0) + 1
    seen.set(baseKey, count)
    if (count > 1) {
      warn(`[kenos/spacesList] duplicate listKey: ${baseKey}`)
      return { ...item, listKey: `${baseKey}#${count}` }
    }
    return item
  })
}

/**
 * @param {{
 *   hosted?: ReadonlyArray<{ id: string, label: string, detail: string, href: string }>
 *   external?: ReadonlyArray<{ id: string, label: string, detail: string, href: string }>
 *   warn?: (...args: unknown[]) => void
 * }} [options]
 */
export function buildSpacesList({
  hosted = HOSTED_SPACES,
  external = KENOS_SPACES,
  warn = console.warn,
} = {}) {
  const items = [
    ...hosted.map((space) => ({
      ...space,
      external: false,
      listKey: spaceListKey('hosted', space.id),
    })),
    ...external.map((space) => ({
      ...space,
      external: true,
      listKey: spaceListKey('external', space.id),
    })),
  ]
  return assignUniqueListKeys(items, { warn })
}
