/**
 * HOME.OS icon registry — Lucide deep imports only.
 */
import Home from '@lucide/svelte/icons/house'
import LayoutGrid from '@lucide/svelte/icons/layout-grid'
import Archive from '@lucide/svelte/icons/archive'
import Settings from '@lucide/svelte/icons/settings'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import Download from '@lucide/svelte/icons/download'
import FileText from '@lucide/svelte/icons/file-text'
import Map from '@lucide/svelte/icons/map'
import Box from '@lucide/svelte/icons/box'
import Ruler from '@lucide/svelte/icons/ruler'
import Search from '@lucide/svelte/icons/search'
import Plus from '@lucide/svelte/icons/plus'
import Pencil from '@lucide/svelte/icons/pencil'
import Trash from '@lucide/svelte/icons/trash-2'
import MoveRight from '@lucide/svelte/icons/corner-up-right'
import X from '@lucide/svelte/icons/x'
import ListChecks from '@lucide/svelte/icons/list-checks'

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  home: Home,
  'layout-grid': LayoutGrid,
  archive: Archive,
  settings: Settings,
  'chevron-left': ChevronLeft,
  download: Download,
  'file-text': FileText,
  map: Map,
  box: Box,
  ruler: Ruler,
  search: Search,
  plus: Plus,
  pencil: Pencil,
  trash: Trash,
  'move-right': MoveRight,
  x: X,
  'list-checks': ListChecks,
}
