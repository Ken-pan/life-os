/**
 * KnowledgeOS 导航 IA — 单套稳定侧栏（取消「笔记 / 知识」双模式）。
 *
 * 桌面：分组侧栏（收集 / 知识库 / 工作空间）+ 脚部设置
 * 移动：底栏 4 主入口 +「更多」收纳时间线 / 概览 / 设置
 */

/** @typedef {{ href: string, icon: string, label: string, key?: string }} NavItem */
/** @typedef {{ label?: string, items: NavItem[] }} NavGroup */

export const APP_HOME = '/library'

/** 桌面侧栏分组（顺序即产品心智：捕获 → 库 → 工作）。 */
export function navGroups(t) {
  return [
    {
      label: t('nav.groupCapture'),
      items: [{ href: '/', icon: 'inbox', label: t('nav.inbox'), key: 'inbox' }],
    },
    {
      label: t('nav.groupLibrary'),
      items: [
        { href: '/library', icon: 'notes', label: t('nav.allNotes'), key: 'library' },
        { href: '/timeline', icon: 'timeline', label: t('nav.timeline'), key: 'timeline' },
      ],
    },
    {
      label: t('nav.groupWorkspace'),
      items: [
        { href: '/projects', icon: 'projects', label: t('nav.projects'), key: 'projects' },
        { href: '/recall', icon: 'recall', label: t('nav.recall'), key: 'recall' },
        { href: '/overview', icon: 'overview', label: t('nav.overview'), key: 'overview' },
      ],
    },
  ]
}

/** 扁平列表（测试 / 兼容旧调用）。 */
export function navItems(t) {
  return navGroups(t).flatMap((g) => g.items)
}

/** 移动底栏主入口（不含「更多」内项）。 */
export function primaryNavItems(t) {
  return [
    { href: '/', icon: 'inbox', label: t('nav.inbox'), key: 'inbox' },
    { href: '/library', icon: 'notes', label: t('nav.allNotes'), key: 'library' },
    { href: '/projects', icon: 'projects', label: t('nav.projects'), key: 'projects' },
    { href: '/recall', icon: 'recall', label: t('nav.recall'), key: 'recall' },
  ]
}

/** 「更多」sheet 内的次级入口（WebNavGroup 形状）。 */
export function moreNavGroups(t) {
  return [
    {
      label: t('nav.groupLibrary'),
      items: [
        {
          tab: 'timeline',
          href: '/timeline',
          icon: 'timeline',
          label: t('nav.timeline'),
          match: (p) => p.startsWith('/timeline'),
        },
      ],
    },
    {
      label: t('nav.groupWorkspace'),
      items: [
        {
          tab: 'overview',
          href: '/overview',
          icon: 'overview',
          label: t('nav.overview'),
          match: (p) => p.startsWith('/overview'),
        },
        {
          tab: 'settings',
          href: '/settings',
          icon: 'settings',
          label: t('nav.settings'),
          match: (p) => p.startsWith('/settings'),
        },
      ],
    },
  ]
}

/** 当前路径是否落在「更多」内的路由上。 */
export function isMoreNavActive(pathname) {
  return (
    pathname.startsWith('/timeline') ||
    pathname.startsWith('/overview') ||
    pathname.startsWith('/settings')
  )
}
