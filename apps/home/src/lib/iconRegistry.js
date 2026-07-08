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
}
