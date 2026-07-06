import Check from '@lucide/svelte/icons/check';
import X from '@lucide/svelte/icons/x';
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import ChevronUp from '@lucide/svelte/icons/chevron-up';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import Plus from '@lucide/svelte/icons/plus';
import Home from '@lucide/svelte/icons/house';
import Inbox from '@lucide/svelte/icons/inbox';
import Calendar from '@lucide/svelte/icons/calendar';
import Search from '@lucide/svelte/icons/search';
import Settings from '@lucide/svelte/icons/settings';
import List from '@lucide/svelte/icons/list';
import Clock from '@lucide/svelte/icons/clock';
import Sun from '@lucide/svelte/icons/sun';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Trash2 from '@lucide/svelte/icons/trash-2';
import Pencil from '@lucide/svelte/icons/pencil';
import Ellipsis from '@lucide/svelte/icons/ellipsis';
import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  check: Check,
  x: X,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  plus: Plus,
  home: Home,
  inbox: Inbox,
  calendar: Calendar,
  search: Search,
  settings: Settings,
  list: List,
  clock: Clock,
  sun: Sun,
  sparkles: Sparkles,
  trash: Trash2,
  pencil: Pencil,
  ellipsis: Ellipsis,
  'rotate-ccw': RotateCcw
};
