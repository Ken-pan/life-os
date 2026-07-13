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
    customPrompt: '', // 自定义指令
    userProfile: DEFAULT_USER_PROFILE, // 用户画像(常驻注入的核心记忆,设置页可编辑)
    userProfileVersion: PROFILE_SCHEMA_VERSION,
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
if (browser) persistence.save(S)

export function save() {
  if (!browser) return
  persistence.save(S)
}

const THEME_APPLY_OPTIONS = {
  themeColorFallback: { light: '#ffffff', dark: '#212121' },
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
