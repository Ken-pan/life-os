import ArrowDown from '@lucide/svelte/icons/arrow-down'
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
import ArrowUp from '@lucide/svelte/icons/arrow-up'
import Activity from '@lucide/svelte/icons/activity'
import Brain from '@lucide/svelte/icons/brain'
import Briefcase from '@lucide/svelte/icons/briefcase'
import Download from '@lucide/svelte/icons/download'
import Ellipsis from '@lucide/svelte/icons/ellipsis'
import ExternalLink from '@lucide/svelte/icons/external-link'
import Eye from '@lucide/svelte/icons/eye'
import FileText from '@lucide/svelte/icons/file-text'
import Focus from '@lucide/svelte/icons/focus'
import Home from '@lucide/svelte/icons/home'
import Music from '@lucide/svelte/icons/music'
import Pencil from '@lucide/svelte/icons/pencil'
import Search from '@lucide/svelte/icons/search'
import Volume2 from '@lucide/svelte/icons/volume-2'
import Calculator from '@lucide/svelte/icons/calculator'
import Check from '@lucide/svelte/icons/check'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import ChevronRight from '@lucide/svelte/icons/chevron-right'
import CircleUser from '@lucide/svelte/icons/circle-user'
import Clock from '@lucide/svelte/icons/clock'
import CloudUpload from '@lucide/svelte/icons/cloud-upload'
import CloudCheck from '@lucide/svelte/icons/cloud-check'
import Code from '@lucide/svelte/icons/code'
import Copy from '@lucide/svelte/icons/copy'
import Globe from '@lucide/svelte/icons/globe'
import History from '@lucide/svelte/icons/history'
import Image from '@lucide/svelte/icons/image'
import Lightbulb from '@lucide/svelte/icons/lightbulb'
import LoaderCircle from '@lucide/svelte/icons/loader-circle'
import Play from '@lucide/svelte/icons/play'
import Pause from '@lucide/svelte/icons/pause'
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
import Wallet from '@lucide/svelte/icons/wallet'
import ListTodo from '@lucide/svelte/icons/list-todo'
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
import LayoutGrid from '@lucide/svelte/icons/layout-grid'
import Menu from '@lucide/svelte/icons/menu'
import Plug from '@lucide/svelte/icons/plug'
import Square from '@lucide/svelte/icons/square'
import SquarePen from '@lucide/svelte/icons/square-pen'
import Star from '@lucide/svelte/icons/star'
import Sun from '@lucide/svelte/icons/sun'
import Trash2 from '@lucide/svelte/icons/trash-2'
import Wrench from '@lucide/svelte/icons/wrench'
import X from '@lucide/svelte/icons/x'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  'arrow-down': ArrowDown,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up': ArrowUp,
  activity: Activity,
  brain: Brain,
  briefcase: Briefcase,
  download: Download,
  'more-horizontal': Ellipsis,
  external: ExternalLink,
  eye: Eye,
  file: FileText,
  focus: Focus,
  home: Home,
  music: Music,
  pencil: Pencil,
  search: Search,
  speaker: Volume2,
  calculator: Calculator,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  user: CircleUser,
  clock: Clock,
  'cloud-upload': CloudUpload,
  'cloud-check': CloudCheck,
  code: Code,
  copy: Copy,
  globe: Globe,
  history: History,
  image: Image,
  lightbulb: Lightbulb,
  loader: LoaderCircle,
  play: Play,
  pause: Pause,
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
  wallet: Wallet,
  'list-todo': ListTodo,
  dashboard: LayoutDashboard,
  'layout-grid': LayoutGrid,
  menu: Menu,
  plug: Plug,
  stop: Square,
  compose: SquarePen,
  star: Star,
  sun: Sun,
  trash: Trash2,
  wrench: Wrench,
  x: X,
}
