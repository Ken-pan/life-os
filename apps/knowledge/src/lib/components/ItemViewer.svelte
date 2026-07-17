<script>
  // 阅读 ↔ 编辑流程包装：父组件设 `open = item` 打开阅读视图；
  // wikilink / 反向链接跳转、「编辑」切换全在内部闭环。inbox/library/timeline 复用。
  import NoteReader from './NoteReader.svelte'
  import ItemEditorSheet from './ItemEditorSheet.svelte'

  /** @type {{ open: any | null }} */
  let { open = $bindable(null) } = $props()
  let editing = $state(null)
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
<ItemEditorSheet item={editing} onClose={() => (editing = null)} />
