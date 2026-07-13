import ArrowUp from '@lucide/svelte/icons/arrow-up'
import Brain from '@lucide/svelte/icons/brain'
import Calculator from '@lucide/svelte/icons/calculator'
import Check from '@lucide/svelte/icons/check'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import Clock from '@lucide/svelte/icons/clock'
import Code from '@lucide/svelte/icons/code'
import Copy from '@lucide/svelte/icons/copy'
import Globe from '@lucide/svelte/icons/globe'
import History from '@lucide/svelte/icons/history'
import Lightbulb from '@lucide/svelte/icons/lightbulb'
import MessageCircle from '@lucide/svelte/icons/message-circle'
import Mic from '@lucide/svelte/icons/mic'
import Paperclip from '@lucide/svelte/icons/paperclip'
import Plus from '@lucide/svelte/icons/plus'
import RefreshCw from '@lucide/svelte/icons/refresh-cw'
import Settings from '@lucide/svelte/icons/settings'
import Square from '@lucide/svelte/icons/square'
import SquarePen from '@lucide/svelte/icons/square-pen'
import Trash2 from '@lucide/svelte/icons/trash-2'
import Wrench from '@lucide/svelte/icons/wrench'
import X from '@lucide/svelte/icons/x'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  'arrow-up': ArrowUp,
  brain: Brain,
  calculator: Calculator,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  clock: Clock,
  code: Code,
  copy: Copy,
  globe: Globe,
  history: History,
  lightbulb: Lightbulb,
  chat: MessageCircle,
  mic: Mic,
  paperclip: Paperclip,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings,
  stop: Square,
  compose: SquarePen,
  trash: Trash2,
  wrench: Wrench,
  x: X,
}
