import { LIFE_OS_SITE_META } from '@life-os/theme'

/** @typedef {'planner' | 'finance' | 'fitness' | 'music'} LauncherAppId */

/**
 * Portal launcher 顺序与各端真实品牌色（与各 app app.css 对齐，非 Tailwind 渐变）
 * @type {Array<{
 *   id: LauncherAppId,
 *   url: string,
 *   iconLight: string,
 *   iconDark: string,
 *   accent: string,
 * }>}
 */
export const PORTAL_APPS = [
  {
    id: 'planner',
    url: 'https://planner.kenos.space',
    iconLight: '/apps/planner-light-96.png',
    iconDark: '/apps/planner-dark-96.png',
    accent: '#c47a08',
  },
  {
    id: 'finance',
    url: 'https://finance.kenos.space',
    iconLight: '/apps/finance-light-96.png',
    iconDark: '/apps/finance-dark-96.png',
    accent: '#4d7c0f',
  },
  {
    id: 'fitness',
    url: 'https://fitness.kenos.space',
    iconLight: '/apps/fitness-light-96.png',
    iconDark: '/apps/fitness-dark-96.png',
    accent: '#ff4d2e',
  },
  {
    id: 'music',
    url: 'https://music.kenos.space',
    iconLight: '/apps/music-light-96.png',
    iconDark: '/apps/music-dark-96.png',
    accent: '#c41e3a',
  },
]

/** @param {LauncherAppId} id */
export function getLauncherMeta(id) {
  return LIFE_OS_SITE_META[id]
}
