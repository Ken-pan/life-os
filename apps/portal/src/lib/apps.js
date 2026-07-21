import { LIFE_OS_SITE_META } from '@life-os/theme'

/** @typedef {'planner' | 'finance' | 'fitness' | 'music' | 'home' | 'aios'} LauncherAppId */

/**
 * Portal launcher 顺序与各端真实品牌色（与各 app app.css 对齐，非 Tailwind 渐变）
 * @type {Array<{
 *   id: LauncherAppId,
 *   url: string,
 *   iconLight: string,
 *   iconDark: string,
 *   accent: string,
 *   experimental?: boolean,
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
  {
    id: 'home',
    url: 'https://home.kenos.space',
    iconLight: '/apps/home-light-96.png',
    iconDark: '/apps/home-dark-96.png',
    accent: '#5c758c',
    experimental: true,
  },
  {
    id: 'aios',
    url: 'https://www.kenos.space',
    iconLight: 'https://www.kenos.space/brand-square-light-96.png',
    iconDark: 'https://www.kenos.space/brand-square-dark-96.png',
    accent: '#5d5d5d',
    experimental: true,
  },
]

/** 四生产站（default_app / 自动跳转；不含实验 Home） */
export const PORTAL_PRODUCTION_APPS = PORTAL_APPS.filter((app) => !app.experimental)

/** @param {LauncherAppId} id */
export function getLauncherMeta(id) {
  return LIFE_OS_SITE_META[id]
}
