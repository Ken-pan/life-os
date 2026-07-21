import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { createSettingsPersistence } from '@life-os/platform-web/persisted-state'
import {
  DEFAULT_USER_PROFILE,
  PROFILE_SCHEMA_VERSION,
  migrateUserProfile,
} from '$lib/profile.js'
import { DEFAULT_TTS_VOICE } from '$lib/localai.js'
import { dataChanged } from '$lib/syncBus.js'

const DEFAULTS = {
  settings: {
    theme: 'auto', // 'light' | 'dark' | 'auto'
    locale: 'zh', // 'zh' | 'en'
    model: 'llm-fast', // 'llm-fast' | 'llm-quality'
    thinking: false, // 思考模式(qwen3.6 enable_thinking)
    tools: true, // 原生工具调用 agent loop
    webAccess: true, // fetch_url 网页阅读(经 r.jina.ai)
    memory: true, // 长期记忆召回注入
    temperature: 0.7,
    ttsVoice: DEFAULT_TTS_VOICE, // 朗读音色(Qwen3-TTS 内置 9 声)
    ttsRate: 1, // 朗读播放速度(迷你播放器里循环切换,记住偏好)
    customPrompt: '', // 自定义指令
    location: '', // 当前所在地(常驻注入,用于天气/本地/时区判断;跟随账号同步)
    dailyBrief: { enabled: false, time: '08:00' }, // 早晨今日简报:开着 app 时定时/追让式原生通知
    userProfile: DEFAULT_USER_PROFILE, // 用户画像(常驻注入的核心记忆,设置页可编辑)
    userProfileVersion: PROFILE_SCHEMA_VERSION,
    // 云同步用:最后一次「用户主动改设置」的毫秒时间戳,整包设置 LWW 的依据。
    // 0 = 从未改过(全默认);启动时的迁移写回不 bump 它,避免新设备用默认覆盖云端。
    settingsUpdatedAt: 0,
  },
}

const persistence = createSettingsPersistence({
  key: 'aiosos_v1',
  defaults: DEFAULTS,
  merge: (parsed, base) => {
    if (!parsed || typeof parsed !== 'object') return base
    const saved =
      parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}
    const version = Number.isInteger(saved.userProfileVersion)
      ? saved.userProfileVersion
      : 1
    return {
      ...base,
      ...parsed,
      settings: {
        ...base.settings,
        ...saved,
        userProfile: migrateUserProfile(
          typeof saved.userProfile === 'string'
            ? saved.userProfile
            : base.settings.userProfile,
          version,
        ),
        userProfileVersion: PROFILE_SCHEMA_VERSION,
      },
    }
  },
  serialize: (state) => ({ settings: state.settings }),
})

export const S = $state(persistence.load())

// 把版本化迁移立即写回；否则用户不进入设置页时旧画像仍留在 localStorage。
// 直接用 persistence.save(不走 save()),迁移写回不算「用户改设置」,不 bump 时间戳。
if (browser) persistence.save(S)

/** 用户主动改设置:落盘 + 打云同步时间戳 + 通知云同步。 */
export function save() {
  if (!browser) return
  S.settings.settingsUpdatedAt = Date.now()
  persistence.save(S)
  dataChanged() // 云同步(若已登录)防抖跟进
}

/**
 * 云端设置落地(cloud.svelte.js 拉到更新的远端设置时调用)。
 * 静默写盘:不 bump 时间戳、不再触发 dataChanged,避免拉→推乒乓。
 * @param {Record<string, unknown>} remoteSettings
 * @param {number} remoteUpdatedAt
 */
export function applyCloudSettings(remoteSettings, remoteUpdatedAt) {
  if (!browser || !remoteSettings || typeof remoteSettings !== 'object') return
  const version = Number.isInteger(remoteSettings.userProfileVersion)
    ? remoteSettings.userProfileVersion
    : 1
  Object.assign(S.settings, remoteSettings, {
    userProfile: migrateUserProfile(
      typeof remoteSettings.userProfile === 'string'
        ? remoteSettings.userProfile
        : S.settings.userProfile,
      version,
    ),
    userProfileVersion: PROFILE_SCHEMA_VERSION,
    settingsUpdatedAt: remoteUpdatedAt,
  })
  persistence.save(S)
  applyTheme() // 主题即时生效;locale 由 layout 的 $effect 监听 S.settings.locale 自动应用
}

/**
 * After logout / account switch: keep device prefs, drop identity fields in memory + disk.
 * @param {Record<string, unknown>} nextSettings from stripUserFieldsFromSettings
 */
export function applyDeviceOnlySettings(nextSettings) {
  if (!browser || !nextSettings || typeof nextSettings !== 'object') return
  Object.assign(S.settings, nextSettings, {
    customPrompt: '',
    location: '',
    userProfile: '',
    settingsUpdatedAt: 0,
  })
  persistence.save(S)
  applyTheme()
}

const THEME_APPLY_OPTIONS = {
  themeColorFallback: { light: '#f5f3f0', dark: '#08090a' },
}

/** @returns {'light'|'dark'} */
export function resolveAppTheme() {
  return resolveTheme(S.settings.theme, 'dark')
}

export function applyTheme() {
  if (!browser) return
  applyResolvedTheme(resolveAppTheme(), THEME_APPLY_OPTIONS)
}

/** @returns {() => void} */
export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'dark',
  )
}
