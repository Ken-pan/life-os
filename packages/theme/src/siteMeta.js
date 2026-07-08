/** @typedef {'planner' | 'fitness' | 'finance' | 'music' | 'home' | 'portal'} LifeOsAppId */

/**
 * Life OS 三端统一的浏览器 / PWA / 社交分享 metadata
 * @type {Record<LifeOsAppId, {
 *   id: LifeOsAppId,
 *   name: string,
 *   shortName: string,
 *   description: { zh: string, en: string },
 *   themeColor: { light: string, dark: string },
 *   defaultTheme: 'light' | 'dark' | 'auto',
 *   locale: string,
 *   storageKey: string,
 *   storageKind: 'nested' | 'direct',
 *   settingsThemePath: string[],
 *   favicon: { id?: string, light: string, dark?: string },
 *   manifest: string,
 *   appleTouchIcon: string,
 *   categories: string[]
 * }>}
 */
export const LIFE_OS_SITE_META = {
  planner: {
    id: 'planner',
    name: 'PLANNER.OS',
    shortName: 'PLANNER',
    description: {
      zh: '阳光感任务清单 · 轻松规划每一天',
      en: 'Sunny tasks, calm planning',
    },
    themeColor: { light: '#f5f3f0', dark: '#121110' },
    defaultTheme: 'auto',
    locale: 'zh-CN',
    storageKey: 'planos_v1',
    storageKind: 'nested',
    settingsThemePath: ['settings', 'theme'],
    favicon: {
      id: 'app-favicon',
      light: '/favicon-32.png',
      dark: '/favicon-32.png',
    },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/apple-touch-icon.png',
    categories: ['productivity', 'utilities'],
  },
  fitness: {
    id: 'fitness',
    name: 'FITNESS.OS',
    shortName: 'FITNESS',
    description: {
      zh: '胸 · 背 · 腿 · 臂 四日循环保练 · 手臂围优先',
      en: 'Four-day split training · arm circumference first',
    },
    themeColor: { light: '#f4f4f3', dark: '#0d0d0e' },
    defaultTheme: 'dark',
    locale: 'zh-CN',
    storageKey: 'fitos_v2',
    storageKind: 'nested',
    settingsThemePath: ['settings', 'theme'],
    favicon: { light: '/favicon-32.png' },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/apple-touch-icon.png',
    categories: ['health', 'fitness', 'utilities'],
  },
  finance: {
    id: 'finance',
    name: 'FINANCE.OS',
    shortName: 'FINANCE',
    description: {
      zh: '个人财务驾驶舱 · 现金流、资产与长期规划',
      en: 'Personal finance cockpit · cash flow, assets & long-range planning',
    },
    themeColor: { light: '#f2f4f2', dark: '#101211' },
    defaultTheme: 'auto',
    locale: 'zh-CN',
    storageKey: 'fos-theme',
    storageKind: 'direct',
    settingsThemePath: [],
    favicon: { light: '/assets/brand/favicon-32.png' },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/assets/brand/apple-touch-icon.png',
    categories: ['finance', 'utilities'],
  },
  music: {
    id: 'music',
    name: 'MUSIC.OS',
    shortName: 'MUSIC',
    description: {
      zh: '本地音乐，留在心里 · 离线播放与歌单',
      en: 'Local music that stays with you · offline playback & playlists',
    },
    themeColor: { light: '#faf5f4', dark: '#100a0c' },
    defaultTheme: 'auto',
    locale: 'zh-CN',
    storageKey: 'musicos_v1',
    storageKind: 'nested',
    settingsThemePath: ['settings', 'theme'],
    favicon: {
      id: 'app-favicon',
      light: '/favicon-32.png',
      dark: '/favicon-32.png',
    },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/apple-touch-icon.png',
    categories: ['music', 'entertainment', 'utilities'],
  },
  home: {
    id: 'home',
    name: 'HOME.OS',
    shortName: 'HOME',
    description: {
      zh: '居家空间规划 · 平面审计与储藏区管理',
      en: 'Home spatial planning · floor audit & storage zones',
    },
    themeColor: { light: '#eef1f4', dark: '#14181c' },
    defaultTheme: 'auto',
    locale: 'zh-CN',
    storageKey: 'homeos_spatial_v1',
    storageKind: 'nested',
    settingsThemePath: ['settings', 'theme'],
    favicon: {
      id: 'app-favicon',
      light: '/favicon-32.png',
      dark: '/favicon-32.png',
    },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/apple-touch-icon.png',
    categories: ['lifestyle', 'utilities'],
  },
  portal: {
    id: 'portal',
    name: 'PORTAL.OS',
    shortName: 'PORTAL',
    description: {
      zh: 'Life OS 统一入口 · 在同一账号下切换 Planner / Finance / Fitness / Music',
      en: 'Life OS portal · switch between Planner, Finance, Fitness, and Music',
    },
    themeColor: { light: '#f3f6f8', dark: '#14161a' },
    defaultTheme: 'auto',
    locale: 'zh-CN',
    storageKey: 'homeos_v1',
    storageKind: 'nested',
    settingsThemePath: ['settings', 'theme'],
    favicon: {
      id: 'app-favicon',
      light: '/favicon-32.png',
      dark: '/favicon-32.png',
    },
    manifest: '/manifest.webmanifest',
    appleTouchIcon: '/apple-touch-icon.png',
    categories: ['productivity', 'utilities'],
  },
}

/** 个人工具类 PWA：默认不对搜索引擎索引 */
export const LIFE_OS_ROBOTS = 'noindex, nofollow'

export const LIFE_OS_REFERRER = 'strict-origin-when-cross-origin'

/**
 * @param {string | null | undefined} pageTitle
 * @param {string} appName
 */
export function formatDocumentTitle(pageTitle, appName) {
  const page = pageTitle?.trim()
  if (!page || page === appName) return appName
  return `${page} · ${appName}`
}

/**
 * @param {LifeOsAppId} appId
 * @param {'zh' | 'en' | string} [locale]
 */
export function getSiteDescription(appId, locale = 'zh') {
  const meta = LIFE_OS_SITE_META[appId]
  return locale === 'en' ? meta.description.en : meta.description.zh
}

/**
 * @param {string | null | undefined} origin
 * @param {string} path
 */
export function absoluteUrl(origin, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!origin) return normalizedPath
  return `${origin.replace(/\/$/, '')}${normalizedPath}`
}

/**
 * @param {LifeOsAppId} appId
 * @param {'zh' | 'en' | string} [locale]
 */
export function getOgLocale(locale = 'zh') {
  return locale === 'en' ? 'en_US' : 'zh_CN'
}
