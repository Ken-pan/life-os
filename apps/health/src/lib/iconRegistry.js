import HeartPulse from '@lucide/svelte/icons/heart-pulse'
import Timer from '@lucide/svelte/icons/timer'
import Settings from '@lucide/svelte/icons/settings'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  now: HeartPulse,
  focus: Timer,
  settings: Settings,
}
