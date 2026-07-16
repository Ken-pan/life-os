import Calendar from '@lucide/svelte/icons/calendar'
import Check from '@lucide/svelte/icons/check'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import ChevronRight from '@lucide/svelte/icons/chevron-right'
import ChevronUp from '@lucide/svelte/icons/chevron-up'
import Home from '@lucide/svelte/icons/house'
import Search from '@lucide/svelte/icons/search'
import Settings from '@lucide/svelte/icons/settings'
import X from '@lucide/svelte/icons/x'

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  calendar: Calendar,
  check: Check,
  x: X,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  home: Home,
  search: Search,
  settings: Settings,
}
