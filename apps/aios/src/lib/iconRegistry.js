import ArrowDown from '@lucide/svelte/icons/arrow-down'
import ArrowUp from '@lucide/svelte/icons/arrow-up'
import Brain from '@lucide/svelte/icons/brain'
import Download from '@lucide/svelte/icons/download'
import ExternalLink from '@lucide/svelte/icons/external-link'
import Eye from '@lucide/svelte/icons/eye'
import FileText from '@lucide/svelte/icons/file-text'
import Pencil from '@lucide/svelte/icons/pencil'
import Search from '@lucide/svelte/icons/search'
import Volume2 from '@lucide/svelte/icons/volume-2'
import Calculator from '@lucide/svelte/icons/calculator'
import Check from '@lucide/svelte/icons/check'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import ChevronRight from '@lucide/svelte/icons/chevron-right'
import Clock from '@lucide/svelte/icons/clock'
import Code from '@lucide/svelte/icons/code'
import Copy from '@lucide/svelte/icons/copy'
import Globe from '@lucide/svelte/icons/globe'
import History from '@lucide/svelte/icons/history'
import Image from '@lucide/svelte/icons/image'
import Lightbulb from '@lucide/svelte/icons/lightbulb'
import MessageCircle from '@lucide/svelte/icons/message-circle'
import Mic from '@lucide/svelte/icons/mic'
import Monitor from '@lucide/svelte/icons/monitor'
import NotebookText from '@lucide/svelte/icons/notebook-text'
import Paperclip from '@lucide/svelte/icons/paperclip'
import Plus from '@lucide/svelte/icons/plus'
import RefreshCw from '@lucide/svelte/icons/refresh-cw'
import Settings from '@lucide/svelte/icons/settings'
import SquareTerminal from '@lucide/svelte/icons/square-terminal'
import GitPullRequest from '@lucide/svelte/icons/git-pull-request'
import Square from '@lucide/svelte/icons/square'
import SquarePen from '@lucide/svelte/icons/square-pen'
import Trash2 from '@lucide/svelte/icons/trash-2'
import Wrench from '@lucide/svelte/icons/wrench'
import X from '@lucide/svelte/icons/x'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  brain: Brain,
  download: Download,
  external: ExternalLink,
  eye: Eye,
  file: FileText,
  pencil: Pencil,
  search: Search,
  speaker: Volume2,
  calculator: Calculator,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  clock: Clock,
  code: Code,
  copy: Copy,
  globe: Globe,
  history: History,
  image: Image,
  lightbulb: Lightbulb,
  chat: MessageCircle,
  mic: Mic,
  monitor: Monitor,
  notebook: NotebookText,
  paperclip: Paperclip,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings,
  terminal: SquareTerminal,
  github: GitPullRequest,
  stop: Square,
  compose: SquarePen,
  trash: Trash2,
  wrench: Wrench,
  x: X,
}
