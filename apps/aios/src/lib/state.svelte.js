import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { createSettingsPersistence } from '@life-os/platform-web/persisted-state'

const persistence = createSettingsPersistence({
  key: 'aiosos_v1',
  defaults: {
    settings: {
      theme: 'auto', // 'light' | 'dark' | 'auto'
      locale: 'zh', // 'zh' | 'en'
      model: 'llm-fast', // 'llm-fast' | 'llm-quality'
      thinking: false, // 思考模式(qwen3.6 enable_thinking)
      tools: true, // 原生工具调用 agent loop
      webAccess: true, // fetch_url 网页阅读(经 r.jina.ai)
      memory: true, // 长期记忆召回注入
      temperature: 0.7,
      customPrompt: '', // 自定义指令
    },
  },
  serialize: (state) => ({ settings: state.settings }),
})

export const S = $state(persistence.load())

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
