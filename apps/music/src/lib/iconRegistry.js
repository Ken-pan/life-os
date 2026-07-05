import Home from '@lucide/svelte/icons/house';
import Library from '@lucide/svelte/icons/disc-3';
import Compass from '@lucide/svelte/icons/compass';
import ListMusic from '@lucide/svelte/icons/list-music';
import Settings from '@lucide/svelte/icons/settings';
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import Play from '@lucide/svelte/icons/play';
import Pause from '@lucide/svelte/icons/pause';
import SkipBack from '@lucide/svelte/icons/skip-back';
import SkipForward from '@lucide/svelte/icons/skip-forward';
import Shuffle from '@lucide/svelte/icons/shuffle';
import Repeat from '@lucide/svelte/icons/repeat';
import Repeat1 from '@lucide/svelte/icons/repeat-1';
import Heart from '@lucide/svelte/icons/heart';
import Search from '@lucide/svelte/icons/search';
import Upload from '@lucide/svelte/icons/upload';
import List from '@lucide/svelte/icons/list';
import Plus from '@lucide/svelte/icons/plus';
import Music from '@lucide/svelte/icons/music';

/** @type {Record<string, import('svelte').Component>} */
export const ICONS = {
  home: Home,
  library: Library,
  discover: Compass,
  list: ListMusic,
  settings: Settings,
  'chevron-left': ChevronLeft,
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
  music: Music
};
