import Home from '@lucide/svelte/icons/house'
import Library from '@lucide/svelte/icons/disc-3'
import Compass from '@lucide/svelte/icons/compass'
import ListMusic from '@lucide/svelte/icons/list-music'
import Settings from '@lucide/svelte/icons/settings'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import ChevronUp from '@lucide/svelte/icons/chevron-up'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import X from '@lucide/svelte/icons/x'
import Play from '@lucide/svelte/icons/play'
import Pause from '@lucide/svelte/icons/pause'
import SkipBack from '@lucide/svelte/icons/skip-back'
import SkipForward from '@lucide/svelte/icons/skip-forward'
import Shuffle from '@lucide/svelte/icons/shuffle'
import Repeat from '@lucide/svelte/icons/repeat'
import Repeat1 from '@lucide/svelte/icons/repeat-1'
import Heart from '@lucide/svelte/icons/heart'
import Search from '@lucide/svelte/icons/search'
import Upload from '@lucide/svelte/icons/upload'
import List from '@lucide/svelte/icons/list'
import Plus from '@lucide/svelte/icons/plus'
import Music from '@lucide/svelte/icons/music'
import Ellipsis from '@lucide/svelte/icons/ellipsis'
import ChevronRight from '@lucide/svelte/icons/chevron-right'
import Volume2 from '@lucide/svelte/icons/volume-2'
import Volume1 from '@lucide/svelte/icons/volume-1'
import VolumeX from '@lucide/svelte/icons/volume-x'
import Mic from '@lucide/svelte/icons/mic-vocal'
import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
import Filter from '@lucide/svelte/icons/filter'
import LayoutList from '@lucide/svelte/icons/layout-list'
import LayoutGrid from '@lucide/svelte/icons/layout-grid'
import MoreHorizontal from '@lucide/svelte/icons/more-horizontal'
import Sparkles from '@lucide/svelte/icons/sparkles'
import Headphones from '@lucide/svelte/icons/headphones'
import CircleUser from '@lucide/svelte/icons/circle-user'

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  home: Home,
  library: Library,
  discover: Compass,
  list: ListMusic,
  settings: Settings,
  'chevron-left': ChevronLeft,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  x: X,
  play: Play,
  pause: Pause,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  shuffle: Shuffle,
  repeat: Repeat,
  'repeat-1': Repeat1,
  heart: Heart,
  search: Search,
  upload: Upload,
  queue: List,
  plus: Plus,
  music: Music,
  ellipsis: Ellipsis,
  'chevron-right': ChevronRight,
  'volume-2': Volume2,
  'volume-1': Volume1,
  'volume-x': VolumeX,
  mic: Mic,
  'arrow-up-down': ArrowUpDown,
  filter: Filter,
  'layout-list': LayoutList,
  'layout-grid': LayoutGrid,
  'more-horizontal': MoreHorizontal,
  headphones: Headphones,
  sparkles: Sparkles,
  'circle-user': CircleUser,
}
