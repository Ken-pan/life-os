import Inbox from '@lucide/svelte/icons/inbox'
import LibraryBig from '@lucide/svelte/icons/library-big'
import FolderKanban from '@lucide/svelte/icons/folder-kanban'
import History from '@lucide/svelte/icons/history'
import Sparkles from '@lucide/svelte/icons/sparkles'
import Settings from '@lucide/svelte/icons/settings'
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
import NotebookText from '@lucide/svelte/icons/notebook-text'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  inbox: Inbox,
  library: LibraryBig,
  notes: NotebookText,
  projects: FolderKanban,
  timeline: History,
  recall: Sparkles,
  settings: Settings,
  overview: LayoutDashboard,
}
