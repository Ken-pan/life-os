<script>
  // 阅读 ↔ 编辑流程包装：父组件设 `open = item` 打开阅读视图；
  // wikilink / 反向链接跳转、「编辑」切换全在内部闭环。inbox/library/timeline 复用。
  // 编辑走块状所见即所得编辑器（NoteEditor，对标 Notion）。
  import NoteReader from './NoteReader.svelte'
  import NoteEditor from './NoteEditor.svelte'
  import { S, updateItem, deleteItem, togglePin } from '$lib/state.svelte.js'

  /** @type {{ open: any | null }} */
  let { open = $bindable(null) } = $props()
  let editing = $state(null)

  // 双链补全用：全库标题（去空）。
  const titles = $derived(S.items.map((i) => i.title).filter(Boolean))
</script>

<NoteReader
  item={open}
  onClose={() => (open = null)}
  onOpen={(it) => (open = it)}
  onEdit={(it) => {
    open = null
    editing = it
  }}
/>
<NoteEditor
  item={editing}
  {titles}
  onClose={() => (editing = null)}
  onSave={(patch) => editing && updateItem(editing.id, patch)}
  onDelete={() => {
    if (editing) deleteItem(editing.id)
    editing = null
  }}
  onTogglePin={() => editing && togglePin(editing.id)}
/>
