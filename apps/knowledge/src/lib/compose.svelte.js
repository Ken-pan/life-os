/**
 * 全局「新建笔记」：建一条空白笔记 → 跳到笔记工作台（/library）并选中它，就地开写。
 * 顶栏「+」、空态 CTA 等任意处调用。
 */
import { goto } from '$app/navigation'
import { createNote } from '$lib/state.svelte.js'

export function startNote() {
  const item = createNote()
  goto(`/library?note=${encodeURIComponent(item.id)}`, { keepFocus: true, noScroll: true })
}
