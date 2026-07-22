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
    label: '训练',
    detail: '今日训练 · 记录与计划',
    href: domainDeepLink('training', '/'),
    domainId: 'training',
    accent: domainAccent('training'),
    icon: domainIcon('training'),
    availability: 'ready',
  },
  {
    id: 'work-focus',
    label: '工作 · 专注',
    detail: '进入当前项目专注',
    href: '/spaces/work',
    accent: domainAccent('work-focus'),
    icon: domainIcon('work-focus'),
    availability: 'ready',
  },
  {
    id: 'work',
    label: '工作',
    detail: '项目 · 决策 · 深度工作',
    href: '/work',
    domainId: 'work',
    accent: domainAccent('work'),
    icon: domainIcon('work'),
    availability: 'ready',
  },
  {
    id: 'code',
    label: 'Code',
    detail: 'Cursor 对话 · 远程操控',
    // aios 自有原生路由(同 work 模式),非外部域深链。
    href: '/code',
    domainId: 'code',
    accent: domainAccent('code'),
    icon: domainIcon('code'),
    availability: 'ready',
    // 仅在 Mac app(Tauri)/ iOS app(WKWebView 壳)内出现;普通浏览器隐藏。
    shellOnly: true,
  },
  {
    id: 'projects',
    label: 'Projects',
    detail: 'Outcome · 下一步 · 关联 · 回顾',
    // aios 自有原生路由:Project Spine cockpit(真源仍在 Planner/Vault)。
    href: '/projects',
    domainId: 'projects',
    accent: domainAccent('projects'),
    icon: domainIcon('projects'),
    availability: 'ready',
  },
  {
    id: 'plan',
    label: '计划',
    detail: '任务 · 日程 · 即将到期',
    href: domainDeepLink('plan', '/upcoming'),
    domainId: 'plan',
    accent: domainAccent('plan'),
    icon: domainIcon('plan'),
    availability: 'ready',
  },
  {
    id: 'money',
    label: '财务',
    detail: '收支 · 结余 · 今日',
    href: domainDeepLink('money', '/home/today'),
    domainId: 'money',
    accent: domainAccent('money'),
    icon: domainIcon('money'),
    availability: 'ready',
  },
  {
    id: 'music',
    label: '音乐',
    detail: '正在播放 · 收藏',
    href: domainDeepLink('music', '/'),
    domainId: 'music',
    accent: domainAccent('music'),
    icon: domainIcon('music'),
    availability: 'ready',
  },
  {
    id: 'home',
    label: '家',
    detail: '房间 · 收纳 · 物品',
    href: domainDeepLink('home', '/plan'),
    domainId: 'home',
    accent: domainAccent('home'),
    icon: domainIcon('home'),
    availability: 'ready',
  },
  {
    id: 'knowledge',
    label: '知识库',
    detail: '笔记 · 资料 · 知识库',
    href: domainDeepLink('knowledge', '/'),
    domainId: 'library',
    accent: domainAccent('knowledge'),
    icon: domainIcon('knowledge'),
    availability: 'ready',
  },
  {
    id: 'health',
    label: '健康',
    detail: '准备度 · 专注 · 趋势',
    href: domainDeepLink('health', '/'),
    domainId: 'health',
    accent: '#5B6CFF',
    icon: 'heart',
    availability: 'ready',
  },
  {
    id: 'paper',
    label: 'Paper',
    detail: '笔记与捕获',
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
      'projects',
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
  // shellOnly 空间(如 code)默认隐藏;仅 Mac/iOS 壳内传 true 放行。
  shellAllowed = false,
} = {}) {
  const items = [
    ...hosted
      .filter((space) => shellAllowed || !space.shellOnly)
      .map((space) => ({
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
      label: '家',
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
