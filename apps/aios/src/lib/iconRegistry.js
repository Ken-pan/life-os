import ArrowUp from '@lucide/svelte/icons/arrow-up'
import Check from '@lucide/svelte/icons/check'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import Copy from '@lucide/svelte/icons/copy'
import History from '@lucide/svelte/icons/history'
import MessageCircle from '@lucide/svelte/icons/message-circle'
import Plus from '@lucide/svelte/icons/plus'
import RefreshCw from '@lucide/svelte/icons/refresh-cw'
import Settings from '@lucide/svelte/icons/settings'
import Square from '@lucide/svelte/icons/square'
import SquarePen from '@lucide/svelte/icons/square-pen'
import Trash2 from '@lucide/svelte/icons/trash-2'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  'arrow-up': ArrowUp,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  copy: Copy,
  history: History,
  chat: MessageCircle,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings,
  stop: Square,
  compose: SquarePen,
  trash: Trash2,
}
