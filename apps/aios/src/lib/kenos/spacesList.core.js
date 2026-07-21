/**
 * Spaces catalog — domain apps open via state-restored deep links (no empty bridge UI).
 * Hosted in-app routes remain only for Kenos-native surfaces (Work Deep Work, Work hub).
 */
import { DOMAIN_ORIGINS, domainDeepLink } from './domainResume.core.js'
import { domainAccent, domainIcon } from './domainIdentity.core.js'

/** @typedef {{ id: string, label: string, detail: string, href: string, domainId?: string, accent?: string, icon?: string, availability?: 'ready' | 'preparing' }} SpaceDef */

/**
 * Domain Spaces: href is production deep link. listKey stays hosted:* for resume continuity.
 * Accents / icons come from domainIdentity (Knife 4) — identity ≠ status color.
 * @type {ReadonlyArray<SpaceDef>}
 */
export const HOSTED_SPACES = Object.freeze([
  {
    id: 'training',
    label: 'Training',
    detail: 'Fitness · 今日训练',
    href: domainDeepLink('training', '/'),
    domainId: 'training',
    accent: domainAccent('training'),
    icon: domainIcon('training'),
    availability: 'ready',
  },
  {
    id: 'work-focus',
    label: 'Work · Deep Work',
    detail: '进入当前项目专注',
    href: '/spaces/work',
    accent: domainAccent('work-focus'),
    icon: domainIcon('work-focus'),
    availability: 'ready',
  },
  {
    id: 'work',
    label: 'Work',
    detail: 'Projects · Decisions · Deep Work',
    href: '/work',
    domainId: 'work',
    accent: domainAccent('work'),
    icon: domainIcon('work'),
    availability: 'ready',
  },
  {
    id: 'plan',
    label: 'Plan',
    detail: 'Upcoming · 任务与时间',
    href: domainDeepLink('plan', '/upcoming'),
    domainId: 'plan',
    accent: domainAccent('plan'),
    icon: domainIcon('plan'),
    availability: 'ready',
  },
  {
    id: 'money',
    label: 'Money',
    detail: 'Finance · Today',
    href: domainDeepLink('money', '/home/today'),
    domainId: 'money',
    accent: domainAccent('money'),
    icon: domainIcon('money'),
    availability: 'ready',
  },
  {
    id: 'music',
    label: 'Music',
    detail: '播放与收藏',
    href: domainDeepLink('music', '/'),
    domainId: 'music',
    accent: domainAccent('music'),
    icon: domainIcon('music'),
    availability: 'ready',
  },
  {
    id: 'home',
    label: 'Home',
    detail: '空间与物品',
    href: domainDeepLink('home', '/plan'),
    domainId: 'home',
    accent: domainAccent('home'),
    icon: domainIcon('home'),
    availability: 'ready',
  },
  {
    id: 'knowledge',
    label: 'Library',
    detail: '笔记与资料 · Knowledge vault',
    href: domainDeepLink('knowledge', '/'),
    domainId: 'library',
    accent: domainAccent('knowledge'),
    icon: domainIcon('knowledge'),
    availability: 'ready',
  },
  {
    id: 'health',
    label: 'Health',
    detail: 'Status · Focus · Trends',
    href: domainDeepLink('health', '/'),
    domainId: 'health',
    accent: '#5B6CFF',
    icon: 'heart',
    availability: 'ready',
  },
  {
    id: 'paper',
    label: 'Paper',
    detail: 'Notebooks · legacy fallback（PaperOS 外置）',
    href: '/spaces/paper',
    domainId: 'paper',
    accent: '#8B7355',
    icon: 'pen-tool',
    availability: 'preparing',
  },
])

/** Today / Sidebar shortcuts — domain deep links (no empty bridge hop). */
export const TODAY_SPACE_SHORTCUTS = Object.freeze(
  HOSTED_SPACES.filter((space) =>
    [
      'work',
      'plan',
      'training',
      'money',
      'music',
      'home',
      'knowledge',
      'health',
    ].includes(space.id),
  ),
)

/**
 * @param {'hosted' | 'external' | string} namespace
 * @param {string} id
 */
export function spaceListKey(namespace, id) {
  return `${namespace}:${id}`
}

/**
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
 * Prefer domain deep links. Legacy external catalog kept empty by default.
 *
 * @param {{
 *   hosted?: ReadonlyArray<SpaceDef>
 *   external?: ReadonlyArray<{ id: string, label: string, detail: string, href: string }>
 *   warn?: (...args: unknown[]) => void
 * }} [options]
 */
export function buildSpacesList({
  hosted = HOSTED_SPACES,
  external = [],
  warn = console.warn,
} = {}) {
  const items = [
    ...hosted.map((space) => ({
      ...space,
      // https domain URLs still use hosted:* listKeys for Continuity with resume store
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

/** Legacy production-root catalog (tests / optional external list). */
export function buildLegacyExternalSpaces() {
  return Object.freeze([
    {
      id: 'plan',
      label: 'Plan',
      detail: '任务与时间',
      href: DOMAIN_ORIGINS.plan,
    },
    {
      id: 'money',
      label: 'Money',
      detail: '收支与决策',
      href: DOMAIN_ORIGINS.money,
    },
    {
      id: 'training',
      label: 'Training',
      detail: '训练与恢复',
      href: DOMAIN_ORIGINS.training,
    },
    {
      id: 'music',
      label: 'Music',
      detail: '播放与收藏',
      href: DOMAIN_ORIGINS.music,
    },
    {
      id: 'home',
      label: 'Home',
      detail: '空间与物品',
      href: DOMAIN_ORIGINS.home,
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      detail: '笔记与资料',
      href: DOMAIN_ORIGINS.knowledge,
    },
  ])
}
