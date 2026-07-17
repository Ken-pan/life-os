import Inbox from '@lucide/svelte/icons/inbox'
import LibraryBig from '@lucide/svelte/icons/library-big'
import FolderKanban from '@lucide/svelte/icons/folder-kanban'
import History from '@lucide/svelte/icons/history'
import Sparkles from '@lucide/svelte/icons/sparkles'
import Settings from '@lucide/svelte/icons/settings'

/** App 图标注册表：经 platform-web ICON_REGISTRY_CONTEXT_KEY 注入 Icon 组件 */
export const ICONS = {
  inbox: Inbox,
  library: LibraryBig,
  projects: FolderKanban,
  timeline: History,
  recall: Sparkles,
  settings: Settings,
}
