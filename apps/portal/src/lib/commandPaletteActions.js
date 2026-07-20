import { getLifeOsAppOrigin } from '@life-os/theme'
import { PORTAL_APPS, getLauncherMeta } from './apps.js'

/** @typedef {import('@life-os/theme').LifeOsAppId} LifeOsAppId */

/** @typedef {{
 *   id: string,
 *   appId: LifeOsAppId,
 *   title: string,
 *   subtitle: string,
 *   path: string,
 *   icon: string,
 *   keywords: string[],
 * }} PortalDeepLink */

const RECENT_KEY = 'portal_cp_recent_v1'
const MAX_RECENT = 8

/** @type {PortalDeepLink[]} */
export const PORTAL_DEEP_LINKS = [
  {
    id: 'planner-today',
    appId: 'planner',
    title: 'Planner · 今日',
    subtitle: '今日任务与 Insight',
    path: '/',
    icon: 'calendar',
    keywords: ['planner', 'today', '今日', '任务'],
  },
  {
    id: 'planner-inbox',
    appId: 'planner',
    title: 'Planner · 收件箱',
    subtitle: '未整理任务',
    path: '/inbox',
    icon: 'inbox',
    keywords: ['planner', 'inbox', '收件箱'],
  },
  {
    id: 'planner-upcoming',
    appId: 'planner',
    title: 'Planner · 即将到来',
    subtitle: '未来 7 天',
    path: '/upcoming',
    icon: 'calendar-days',
    keywords: ['planner', 'upcoming', '未来'],
  },
  {
    id: 'planner-calendar',
    appId: 'planner',
    title: 'Planner · 日历',
    subtitle: '月视图',
    path: '/calendar',
    icon: 'calendar-range',
    keywords: ['planner', 'calendar', '日历'],
  },
  {
    id: 'finance-today',
    appId: 'finance',
    title: 'Finance · 今日可花',
    subtitle: 'Safe-to-spend 与现金流',
    path: '/home/today',
    icon: 'wallet',
    keywords: ['finance', 'today', '可花', 'sts'],
  },
  {
    id: 'finance-history',
    appId: 'finance',
    title: 'Finance · 历史',
    subtitle: '交易与洞察',
    path: '/history/insights',
    icon: 'line-chart',
    keywords: ['finance', 'history', '交易', '历史'],
  },
  {
    id: 'finance-review',
    appId: 'finance',
    title: 'Finance · 导入',
    subtitle: 'CSV 与对账',
    path: '/review/import',
    icon: 'upload',
    keywords: ['finance', 'import', '导入', 'review'],
  },
  {
    id: 'fitness-home',
    appId: 'fitness',
    title: 'Fitness · 训练',
    subtitle: '今日训练日',
    path: '/',
    icon: 'dumbbell',
    keywords: ['fitness', 'workout', '训练'],
  },
  {
    id: 'fitness-stats',
    appId: 'fitness',
    title: 'Fitness · 统计',
    subtitle: '完练与趋势',
    path: '/discover/stats',
    icon: 'bar-chart-2',
    keywords: ['fitness', 'stats', '统计'],
  },
  {
    id: 'fitness-program',
    appId: 'fitness',
    title: 'Fitness · 编辑计划',
    subtitle: '动作与轮换',
    path: '/program/edit',
    icon: 'list-checks',
    keywords: ['fitness', 'program', '计划'],
  },
  {
    id: 'music-library',
    appId: 'music',
    title: 'Music · 曲库',
    subtitle: '本地与云端曲目',
    path: '/library',
    icon: 'disc',
    keywords: ['music', 'library', '曲库'],
  },
  {
    id: 'music-browse',
    appId: 'music',
    title: 'Music · 浏览',
    subtitle: '专辑与艺术家',
    path: '/browse',
    icon: 'compass',
    keywords: ['music', 'browse', '浏览'],
  },
  {
    id: 'music-liked',
    appId: 'music',
    title: 'Music · 喜欢',
    subtitle: '收藏曲目',
    path: '/liked',
    icon: 'heart',
    keywords: ['music', 'liked', '喜欢', '收藏'],
  },
  {
    id: 'music-search',
    appId: 'music',
    title: 'Music · 搜索',
    subtitle: '曲库内搜索',
    path: '/search',
    icon: 'search',
    keywords: ['music', 'search', '搜索'],
  },
  {
    id: 'portal-today-soft-redirect',
    appId: 'portal',
    title: 'Portal · Today → Kenos',
    subtitle: 'Owner 限定 soft-redirect（可回滚）',
    path: '/today',
    icon: 'layout-dashboard',
    keywords: ['portal', 'today', 'kenos', 'redirect', '今日'],
  },
  {
    id: 'assistant-today',
    appId: 'aios',
    title: 'Kenos · Today',
    subtitle: '状态、下一步与待决定事项',
    path: '/',
    icon: 'layout-dashboard',
    keywords: ['kenos', 'assistant', 'today', '今日', '默认入口'],
  },
  {
    id: 'assistant-chat',
    appId: 'aios',
    title: 'Kenos · Assistant',
    subtitle: '对话、来源与 Action preview',
    path: '/assistant',
    icon: 'message-circle',
    keywords: ['kenos', 'assistant', 'chat', '对话'],
  },
  {
    id: 'assistant-approvals',
    appId: 'aios',
    title: 'Kenos · Approvals',
    subtitle: '查看动作风险、范围与影响',
    path: '/approvals',
    icon: 'shield-check',
    keywords: ['kenos', 'approval', '审批', '确认'],
  },
  {
    id: 'assistant-activity',
    appId: 'aios',
    title: 'Kenos · Activity',
    subtitle: '动作结果、失败与恢复',
    path: '/activity',
    icon: 'activity',
    keywords: ['kenos', 'activity', '动作', '恢复'],
  },
]

const deepLinkById = Object.fromEntries(PORTAL_DEEP_LINKS.map((link) => [link.id, link]))

/**
 * @param {LifeOsAppId} appId
 * @param {string} path
 */
export function buildPortalDeepLinkUrl(appId, path) {
  const origin = getLifeOsAppOrigin(appId)
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${origin}${normalized}`
}

/** Pending life_events → Planner 收件箱（PORT.GROWTH.8） */
export function buildPlannerInboxUrl() {
  return buildPortalDeepLinkUrl('planner', '/inbox')
}

/** @returns {{ query: string, actionId: string, title: string }[]} */
export function loadRecentSearches() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.query === 'string' &&
        typeof item.actionId === 'string' &&
        typeof item.title === 'string',
    )
  } catch {
    return []
  }
}

/** @param {string} query @param {string} actionId @param {string} title */
export function recordRecentSearch(query, actionId, title) {
  if (typeof localStorage === 'undefined') return
  const trimmed = query.trim()
  if (!trimmed || !actionId) return

  const next = [
    { query: trimmed, actionId, title },
    ...loadRecentSearches().filter((item) => item.actionId !== actionId),
  ].slice(0, MAX_RECENT)

  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {PortalDeepLink} link
 * @param {string} [query]
 */
function deepLinkToAction(link, query = '') {
  return {
    id: link.id,
    title: link.title,
    subtitle: link.subtitle,
    icon: link.icon,
    onSelect: () => {
      if (query) recordRecentSearch(query, link.id, link.title)
      if (link.appId === 'portal') {
        const normalized = link.path.startsWith('/') ? link.path : `/${link.path}`
        window.location.href = normalized
        return
      }
      window.location.href = buildPortalDeepLinkUrl(link.appId, link.path)
    },
  }
}

/**
 * @param {{ signOut: () => Promise<void>, query?: string, allowedAppKeys?: string[] }} options
 */
export function buildPortalCommandActions({ signOut, query = '', allowedAppKeys = [] }) {
  const q = query.trim().toLowerCase()
  const allowed = new Set(allowedAppKeys)

  /** @type {Array<{ id: string, title: string, subtitle?: string, icon?: string, onSelect: () => void }>} */
  const actions = []

  if (!q) {
    for (const recent of loadRecentSearches()) {
      const link = deepLinkById[recent.actionId]
      const app = PORTAL_APPS.find((a) => a.id === link?.appId)
      if (link && allowed.has(link.appId)) {
        actions.push({
          id: `recent-${link.id}`,
          title: recent.title,
          subtitle: `最近搜索 · ${recent.query}`,
          icon: link.icon,
          onSelect: () => {
            recordRecentSearch(recent.query, link.id, link.title)
            window.location.href = buildPortalDeepLinkUrl(link.appId, link.path)
          },
        })
      } else if (app && allowed.has(app.id)) {
        actions.push({
          id: `recent-app-${app.id}`,
          title: recent.title,
          subtitle: `最近搜索 · ${recent.query}`,
          icon: 'external-link',
          onSelect: () => {
            recordRecentSearch(recent.query, app.id, recent.title)
            window.location.href = app.url
          },
        })
      }
    }
  }

  for (const link of PORTAL_DEEP_LINKS) {
    // Portal-local soft routes (e.g. /today) are always available on this host.
    if (link.appId !== 'portal' && !allowed.has(link.appId)) continue
    if (
      q &&
      !link.title.toLowerCase().includes(q) &&
      !link.subtitle.toLowerCase().includes(q) &&
      !link.keywords.some((kw) => kw.toLowerCase().includes(q))
    ) {
      continue
    }
    actions.push(deepLinkToAction(link, query))
  }

  for (const app of PORTAL_APPS) {
    if (!allowed.has(app.id)) continue
    const meta = getLauncherMeta(app.id)
    const label = `打开 ${meta.name}${app.experimental ? '（实验）' : ''}`
    if (
      q &&
      !label.toLowerCase().includes(q) &&
      !app.id.includes(q) &&
      !meta.name.toLowerCase().includes(q)
    ) {
      continue
    }
    actions.push({
      id: `app-${app.id}`,
      title: label,
      subtitle: app.url.replace('https://', ''),
      icon:
        app.id === 'finance'
          ? 'wallet'
          : app.id === 'planner'
            ? 'check-square'
            : app.id === 'fitness'
              ? 'activity'
              : app.id === 'home'
                ? 'home'
                : app.id === 'aios'
                  ? 'message-circle'
                  : 'music',
      onSelect: () => {
        if (query) recordRecentSearch(query, `app-${app.id}`, label)
        window.location.href = app.url
      },
    })
  }

  actions.push({
    id: 'sign-out',
    title: '退出登录',
    icon: 'log-out',
    onSelect: () => signOut().then(() => window.location.reload()),
  })

  return actions
}
