/**
 * 导航模式（笔记 / 知识）—— 侧栏与底栏同源。
 * 「笔记模式」：写与整理（全部笔记 / 收集箱 / 时间线）。
 * 「知识模式」：看与回忆（概览 / 回忆 / 项目）。
 * mode 由当前路由派生（URL 即真相），切换模式即导航到该模式首页。
 */

export const NOTE_HOME = '/library'
export const KNOWLEDGE_HOME = '/overview'

const KNOWLEDGE_ROUTES = ['/overview', '/recall', '/projects']

/** 路径 → 模式；概览/回忆/项目属知识模式，其余（含收集箱/时间线/设置）默认笔记模式。 */
export function modeForPath(pathname) {
  return KNOWLEDGE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))
    ? 'knowledge'
    : 'note'
}

/** 该模式的导航项（label 走传入的 t，避免耦合 i18n 实例）。 */
export function navItems(mode, t) {
  return mode === 'knowledge'
    ? [
        { href: '/overview', icon: 'overview', label: t('nav.overview') },
        { href: '/recall', icon: 'recall', label: t('nav.recall') },
        { href: '/projects', icon: 'projects', label: t('nav.projects') },
      ]
    : [
        { href: '/library', icon: 'notes', label: t('nav.allNotes') },
        { href: '/', icon: 'inbox', label: t('nav.inbox') },
        { href: '/timeline', icon: 'timeline', label: t('nav.timeline') },
      ]
}

/** 分段控件选项（笔记 | 知识）。 */
export function modeOptions(t) {
  return [
    { value: 'note', label: t('nav.modeNote') },
    { value: 'knowledge', label: t('nav.modeKnowledge') },
  ]
}

export function homeForMode(mode) {
  return mode === 'knowledge' ? KNOWLEDGE_HOME : NOTE_HOME
}
