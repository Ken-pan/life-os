/**
 * FITNESS.OS icon registry — Lucide deep imports only.
 * Keep this list minimal: every entry must have a call site.
 */
import Check from '@lucide/svelte/icons/check'
import X from '@lucide/svelte/icons/x'
import ChevronRight from '@lucide/svelte/icons/chevron-right'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronUp from '@lucide/svelte/icons/chevron-up'
import MoveRight from '@lucide/svelte/icons/move-right'
import TrendingUp from '@lucide/svelte/icons/trending-up'
import TrendingDown from '@lucide/svelte/icons/trending-down'
import Play from '@lucide/svelte/icons/play'
import Pause from '@lucide/svelte/icons/pause'
import Timer from '@lucide/svelte/icons/timer'
import Pencil from '@lucide/svelte/icons/pencil'
import Compass from '@lucide/svelte/icons/compass'
import BarChart3 from '@lucide/svelte/icons/bar-chart-3'
import Flame from '@lucide/svelte/icons/flame'
import Repeat from '@lucide/svelte/icons/repeat'
import ClipboardList from '@lucide/svelte/icons/clipboard-list'
import Moon from '@lucide/svelte/icons/moon'
import Home from '@lucide/svelte/icons/house'
import LayoutGrid from '@lucide/svelte/icons/layout-grid'
import BookOpen from '@lucide/svelte/icons/book-open'
import Settings from '@lucide/svelte/icons/settings'
import CircleHelp from '@lucide/svelte/icons/circle-help'
import Calculator from '@lucide/svelte/icons/calculator'
import Image from '@lucide/svelte/icons/image'

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  check: Check,
  x: X,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'arrow-right': MoveRight,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  play: Play,
  pause: Pause,
  timer: Timer,
  pencil: Pencil,
  principles: Compass,
  chart: BarChart3,
  flame: Flame,
  trend: TrendingUp,
  repeat: Repeat,
  clipboard: ClipboardList,
  rest: Moon,
  home: Home,
  program: LayoutGrid,
  library: BookOpen,
  discover: Compass,
  settings: Settings,
  info: CircleHelp,
  calculator: Calculator,
  image: Image,
}
