import { LIFE_OS_SITE_META } from '@life-os/theme'

/** @typedef {'planner' | 'finance' | 'fitness' | 'music'} LauncherAppId */

/**
 * Portal launcher 顺序与各端真实品牌色（与各 app app.css 对齐，非 Tailwind 渐变）
 * @type {Array<{
 *   id: LauncherAppId,
 *   url: string,
 *   icon: string,
 *   accent: string,
 * }>}
 */
export const PORTAL_APPS = [
  {
    id: 'planner',
    url: 'https://planner.kenos.space',
    icon: '/apps/planner.svg',
    accent: '#c47a08',
  },
  {
    id: 'finance',
    url: 'https://finance.kenos.space',
    icon: '/apps/finance.svg',
    accent: '#4d7c0f',
  },
  {
    id: 'fitness',
    url: 'https://fitness.kenos.space',
    icon: '/apps/fitness.svg',
    accent: '#ff4d2e',
  },
  {
    id: 'music',
    url: 'https://music.kenos.space',
    icon: '/apps/music.svg',
    accent: '#c41e3a',
  },
]

/** @param {LauncherAppId} id */
export function getLauncherMeta(id) {
  return LIFE_OS_SITE_META[id]
}
