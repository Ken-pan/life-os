/**
 * PORTAL.OS icon registry — Lucide deep imports for CommandPalette / shell.
 */
import Calendar from '@lucide/svelte/icons/calendar'
import CalendarDays from '@lucide/svelte/icons/calendar-days'
import CalendarRange from '@lucide/svelte/icons/calendar-range'
import Inbox from '@lucide/svelte/icons/inbox'
import Wallet from '@lucide/svelte/icons/wallet'
import ChartLine from '@lucide/svelte/icons/chart-line'
import Upload from '@lucide/svelte/icons/upload'
import Dumbbell from '@lucide/svelte/icons/dumbbell'
import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
import ListChecks from '@lucide/svelte/icons/list-checks'
import Disc from '@lucide/svelte/icons/disc'
import Compass from '@lucide/svelte/icons/compass'
import Heart from '@lucide/svelte/icons/heart'
import Search from '@lucide/svelte/icons/search'
import ExternalLink from '@lucide/svelte/icons/external-link'
import LogOut from '@lucide/svelte/icons/log-out'
import CheckSquare from '@lucide/svelte/icons/check-square'
import Activity from '@lucide/svelte/icons/activity'
import Music from '@lucide/svelte/icons/music'
import Home from '@lucide/svelte/icons/house'
import File from '@lucide/svelte/icons/file'
import X from '@lucide/svelte/icons/x'

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  calendar: Calendar,
  'calendar-days': CalendarDays,
  'calendar-range': CalendarRange,
  inbox: Inbox,
  wallet: Wallet,
  'line-chart': ChartLine,
  'chart-line': ChartLine,
  upload: Upload,
  dumbbell: Dumbbell,
  'bar-chart-2': BarChart2,
  'list-checks': ListChecks,
  disc: Disc,
  compass: Compass,
  heart: Heart,
  search: Search,
  'external-link': ExternalLink,
  'log-out': LogOut,
  'check-square': CheckSquare,
  activity: Activity,
  music: Music,
  home: Home,
  file: File,
  x: X,
}
