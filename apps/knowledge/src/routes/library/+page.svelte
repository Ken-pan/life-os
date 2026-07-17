<script>
  // 全部笔记 = master-detail 工作台：左列表 + 右内联文档（对标 Apple Notes/Bear/Notion）。
  // 选中由 URL ?note=id 驱动（可前进/后退、可深链）；selected 存对象引用，对 vault 改 id 稳健。
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { SearchField } from '@life-os/platform-web/svelte/form'
  import { EmptyState } from '@life-os/platform-web/svelte/status'
  import Plus from '@lucide/svelte/icons/plus'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import {
    S, allTags, allFolders, searchItems, itemById, updateItem, deleteItem, togglePin,
  } from '$lib/state.svelte.js'
  import { groupNotes } from '$lib/analytics.js'
  import { startNote } from '$lib/compose.svelte.js'
  import NoteCards from '$lib/components/NoteCards.svelte'
  import NoteEditor from '$lib/components/NoteEditor.svelte'
  import NoteConnections from '$lib/components/NoteConnections.svelte'
  import { t } from '$lib/i18n/index.js'

  let query = $state('')
  let activeTags = $state(new Set())
  let activeFolder = $state('')

  const folders = $derived(allFolders())
  const contextItems = $derived(
    activeFolder ? S.items.filter((i) => i.id.startsWith(activeFolder + '/')) : S.items,
  )
  const tags = $derived(allTags(contextItems))
  // 行内只放「近期」少量标签（已选优先，保证激活的过滤始终可见），其余进「更多」popover
  const RECENT_CAP = 6
  const inlineTags = $derived.by(() => {
    const sel = tags.filter((tg) => activeTags.has(tg))
    const rest = tags.filter((tg) => !activeTags.has(tg))
    return [...sel, ...rest].slice(0, Math.max(RECENT_CAP, sel.length))
  })
  // 标签 overflow popover（门户到 body，避免被列表列 overflow 裁切）
  let tagPanelOpen = $state(false)
  let tagPanelPos = $state({ x: 0, y: 0 })
  let tagPanelQuery = $state('')
  const TAG_SEARCH_THRESHOLD = 12 // 标签超过这个数才显示搜索框
  const showTagSearch = $derived(tags.length > TAG_SEARCH_THRESHOLD)
  const q = $derived(tagPanelQuery.trim().toLowerCase())
  // 搜索时走扁平过滤；否则分三组：已选 / 最近 / 全部
  const panelMatch = $derived(q ? tags.filter((tg) => tg.toLowerCase().includes(q)) : tags)
  const panelSelected = $derived([...activeTags].filter((tg) => tags.includes(tg)))
  const panelUnselected = $derived(tags.filter((tg) => !activeTags.has(tg)))
  const panelRecent = $derived(panelUnselected.slice(0, 4))
  const panelRest = $derived(panelUnselected.slice(4))
  function openTagPanel(e) {
    const r = e.currentTarget.getBoundingClientRect()
    tagPanelPos = { x: Math.min(r.left, window.innerWidth - 320), y: r.bottom + 6 }
    tagPanelQuery = ''
    tagPanelOpen = true
  }
  function portal(node) { document.body.appendChild(node); return { destroy() { node.remove() } } }
  function autofocus(node) { requestAnimationFrame(() => node.focus()) }
  const results = $derived.by(() => {
    S.items.length // 触响应式
    let matched = searchItems(query, activeTags)
    if (activeFolder) matched = matched.filter((i) => i.id.startsWith(activeFolder + '/'))
    return [...matched].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    )
  })

  const titles = $derived(S.items.map((i) => i.title).filter(Boolean))
  // 当前打开的笔记被筛选条件排除掉时：正文保留（不关），但给一条提示避免「凭空消失」的困惑
  const selectedFilteredOut = $derived(
    !!selected && !results.some((r) => r.id === selected.id),
  )
  // Apple Notes 式分组：置顶 / 今天 / 昨天 / 本周 / 更早
  const groups = $derived(groupNotes(results, { now: Date.now() }))
  const GROUP_LABEL = {
    pinned: 'group.pinned', today: 'group.today', yesterday: 'group.yesterday',
    week: 'group.week', older: 'group.older',
  }

  /* ——— 选中：URL ↔ 对象引用 ——— */
  let selected = $state(null)
  // URL → selected（外部导航 / 前进后退 / 首次进入 / Vault watcher 重载后换对象）
  $effect(() => {
    S.items.length
    const id = page.url.searchParams.get('note')
    if (!id) {
      selected = null
      return
    }
    const next = itemById(id)
    if (next && selected !== next) selected = next
    else if (!next) selected = null
  })
  // selected.id 漂移（vault 保存重命名文件）→ 同步 URL（replace，不进历史）
  $effect(() => {
    const id = selected?.id
    const urlId = page.url.searchParams.get('note')
    if (id && urlId && id !== urlId)
      goto(`/library?note=${encodeURIComponent(id)}`, { replaceState: true, keepFocus: true, noScroll: true })
  })

  function selectNote(item) {
    goto(`/library?note=${encodeURIComponent(item.id)}`, { keepFocus: true, noScroll: true })
  }
  function backToList() {
    goto('/library', { keepFocus: true, noScroll: true })
  }
  function saveNote(patch, it) { if (it) updateItem(it.id, patch) }
  function deleteNote(it) {
    if (!it) return
    const wasSel = it.id === selected?.id
    deleteItem(it.id)
    if (wasSel) backToList()
  }
  function pinNote(it) { if (it) togglePin(it.id) }

  const folderLabel = (path) => path.replace(/^\d+[_-]?/, '')
  function toggleTag(tag) {
    const next = new Set(activeTags)
    if (next.has(tag)) next.delete(tag)
    else next.add(tag)
    activeTags = next
  }

  /* ——— 列表列可拖拽调宽（clamp[320,520]，localStorage 记忆，双击复位）——— */
  const LIST_W_KEY = 'kn_list_w'
  const LIST_W_DEFAULT = 400
  const LIST_W_MIN = 320
  const LIST_W_MAX = 520
  let listW = $state(LIST_W_DEFAULT)
  let resizing = $state(false)
  const clampW = (w) => Math.round(Math.max(LIST_W_MIN, Math.min(LIST_W_MAX, w)))
  const persistW = () => { try { localStorage.setItem(LIST_W_KEY, String(listW)) } catch { /* 无痕/隐私模式 */ } }
  onMount(() => {
    const saved = Number(localStorage.getItem(LIST_W_KEY))
    if (saved >= LIST_W_MIN && saved <= LIST_W_MAX) listW = saved
  })
  function startResize(e) {
    e.preventDefault()
    const nwEl = e.currentTarget.parentElement
    const left = nwEl.getBoundingClientRect().left
    resizing = true
    const move = (ev) => { listW = clampW(ev.clientX - left) }
    const stop = () => {
      resizing = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      persistW()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  function resetResize() { listW = LIST_W_DEFAULT; persistW() }
  function keyResize(e) {
    if (e.key === 'ArrowLeft') { listW = clampW(listW - 16); persistW(); e.preventDefault() }
    else if (e.key === 'ArrowRight') { listW = clampW(listW + 16); persistW(); e.preventDefault() }
  }
</script>

<!-- 方案A：始终保留列表外壳（空库也显示搜索/新建/列表框架），避免创建首篇后布局跳变 -->
<div class="nw" class:is-resizing={resizing} style="--nw-list-w:{listW}px">
    <!-- 列表列 -->
    <aside class="nw-list" class:is-hidden={selected}>
      <div class="nw-list__head">
        <SearchField
          value={query}
          onChange={(v) => (query = v)}
          placeholder={t('library.searchShort')}
          clearLabel={t('library.clearSearch')}
        />
        <button type="button" class="nw-new" onclick={startNote} title={t('common.newNote')}>
          <Plus size={16} strokeWidth={2.4} /><span>{t('library.newShort')}</span>
        </button>
      </div>

      {#if folders.length > 0}
        <div class="chip-row nw-chips" role="group" aria-label={t('library.folderAria')}>
          <button type="button" class="chip" aria-pressed={activeFolder === ''} onclick={() => (activeFolder = '')}>
            {t('library.allFolders')}
          </button>
          {#each folders as folder (folder.path)}
            <button type="button" class="chip" aria-pressed={activeFolder === folder.path}
              onclick={() => (activeFolder = activeFolder === folder.path ? '' : folder.path)}>
              {folderLabel(folder.path)} · {folder.count}
            </button>
          {/each}
        </div>
      {/if}
      {#if tags.length > 0}
        <div class="chip-row nw-chips" role="group" aria-label={t('library.filterAria')}>
          <span class="nw-filter-label">{t('library.filterLabel')}</span>
          {#each inlineTags as tag (tag)}
            <button type="button" class="chip" aria-pressed={activeTags.has(tag)} onclick={() => toggleTag(tag)}>
              {tag}
            </button>
          {/each}
          {#if tags.length > inlineTags.length}
            <button type="button" class="chip nw-tagmore" onclick={openTagPanel} aria-haspopup="dialog" aria-expanded={tagPanelOpen}>
              {t('library.filterMore')} ({tags.length}) ▾
            </button>
          {/if}
          {#if activeTags.size > 0}
            <button type="button" class="chip nw-filter-clear" onclick={() => (activeTags = new Set())}>
              {t('library.filterClear')}
            </button>
          {/if}
        </div>
      {/if}

      <div class="nw-list__body">
        {#if S.items.length === 0}
          <div class="nw-list-empty">
            <p class="nw-list-empty__title">{t('library.welcomeTitle')}</p>
            <p class="nw-list-empty__desc">{t('library.welcomeDesc')}</p>
            <button type="button" class="btn-primary" onclick={startNote}>{t('library.welcomeCta')}</button>
          </div>
        {:else if results.length === 0}
          <div class="settings-block">
            <EmptyState title={t('library.emptyTitle')} description={t('library.emptyDesc')} />
          </div>
        {:else}
          {#each groups as g (g.key)}
            <div class="nw-group">
              <div class="nw-group__label">{t(GROUP_LABEL[g.key])}</div>
              <NoteCards items={g.items} onOpen={selectNote} activeId={selected?.id} />
            </div>
          {/each}
        {/if}
      </div>
    </aside>

    <!-- 文档列 -->
    <section class="nw-doc" class:is-hidden={!selected}>
      {#if selected}
        <button type="button" class="nw-back" onclick={backToList}>
          <ArrowLeft size={16} strokeWidth={2.2} /><span>{t('nav.allNotes')}</span>
        </button>
        {#if selectedFilteredOut}
          <div class="nw-filter-note" role="status">{t('library.notInFilter')}</div>
        {/if}
        <NoteEditor
          inline
          item={selected}
          {titles}
          onSave={saveNote}
          onDelete={deleteNote}
          onTogglePin={pinNote}
          onOpenNote={selectNote}
        >
          {#snippet footer()}
            <NoteConnections item={selected} onOpen={selectNote} />
          {/snippet}
        </NoteEditor>
      {:else}
        <div class="nw-empty">
          {#if S.items.length === 0}
            <!-- 空库：正文区只解释用途，创建入口交给顶栏「＋新建」与列表 onboarding，不做第三个主按钮 -->
            <EmptyState title={t('workspace.emptyDocFirstTitle')} description={t('workspace.emptyDocFirstDesc')} />
          {:else}
            <EmptyState title={t('workspace.emptyDocTitle')} description={t('workspace.emptyDocDesc')} />
            <button type="button" class="btn-primary" onclick={startNote}>{t('common.newNote')}</button>
          {/if}
        </div>
      {/if}
    </section>

    <!-- 列宽拖拽手柄（仅桌面双列显示；双击复位、方向键微调） -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
    <div
      class="nw-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('library.resizeAria')}
      aria-valuenow={listW}
      aria-valuemin={LIST_W_MIN}
      aria-valuemax={LIST_W_MAX}
      tabindex="0"
      onpointerdown={startResize}
      ondblclick={resetResize}
      onkeydown={keyResize}
    ></div>
  </div>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && tagPanelOpen) tagPanelOpen = false }} />

{#if tagPanelOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="nw-tagpop__backdrop" use:portal onclick={() => (tagPanelOpen = false)}></div>
  <div class="nw-tagpop" use:portal style="left:{tagPanelPos.x}px; top:{tagPanelPos.y}px" role="dialog" aria-label={t('library.filterAria')}>
    {#if showTagSearch}
      <input
        class="nw-tagpop__search"
        type="search"
        placeholder={t('library.tagSearch')}
        bind:value={tagPanelQuery}
        use:autofocus
      />
    {/if}
    <div class="nw-tagpop__scroll">
      {#if q}
        <!-- 搜索态：扁平结果 -->
        <div class="nw-tagpop__list">
          {#each panelMatch as tag (tag)}
            <button type="button" class="chip" aria-pressed={activeTags.has(tag)} onclick={() => toggleTag(tag)}>{tag}</button>
          {/each}
          {#if panelMatch.length === 0}<p class="nw-tagpop__empty">{t('library.noTagMatch')}</p>{/if}
        </div>
      {:else}
        {#if panelSelected.length > 0}
          <p class="nw-tagpop__grp">{t('library.tagGroupSelected')}</p>
          <div class="nw-tagpop__list">
            {#each panelSelected as tag (tag)}
              <button type="button" class="chip" aria-pressed="true" onclick={() => toggleTag(tag)}>{tag} ✕</button>
            {/each}
          </div>
        {/if}
        {#if panelRecent.length > 0}
          <p class="nw-tagpop__grp">{t('library.tagGroupRecent')}</p>
          <div class="nw-tagpop__list">
            {#each panelRecent as tag (tag)}
              <button type="button" class="chip" onclick={() => toggleTag(tag)}>{tag}</button>
            {/each}
          </div>
        {/if}
        {#if panelRest.length > 0}
          <p class="nw-tagpop__grp">{t('library.tagGroupAll')}</p>
          <div class="nw-tagpop__list">
            {#each panelRest as tag (tag)}
              <button type="button" class="chip" onclick={() => toggleTag(tag)}>{tag}</button>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
    {#if activeTags.size > 0}
      <button type="button" class="nw-tagpop__clear" onclick={() => (activeTags = new Set())}>{t('library.filterClear')}</button>
    {/if}
  </div>
{/if}

<style>
  /* 空库时列表列内的引导（方案A：外壳不变，列表体给欢迎+CTA） */
  .nw-list-empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: var(--space-2, 8px);
    padding: 12vh var(--space-4, 16px) var(--space-6, 24px);
  }
  .nw-list-empty__title {
    margin: 0;
    font-size: var(--text-md, 14px);
    font-weight: 650;
    color: var(--t1, var(--text));
  }
  .nw-list-empty__desc {
    /* 对比度提一档：secondary 而非 tertiary，暗色下别糊成 disabled */
    margin: 0 0 var(--space-2, 8px);
    font-size: var(--text-sm, 12px);
    line-height: 1.6;
    color: var(--t2, var(--text-secondary));
  }

  .nw {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
  @container life-os-main (min-width: 840px) {
    .nw {
      /* 列表列宽由拖拽写入 --nw-list-w（clamp 320–520，默认 400） */
      grid-template-columns: var(--nw-list-w, 400px) minmax(0, 1fr);
    }
  }
  .nw.is-resizing { cursor: col-resize; user-select: none; }
  /* 窄宽（单列）：按选中态只显一列 */
  @container life-os-main (max-width: 839px) {
    .nw-list.is-hidden,
    .nw-doc.is-hidden { display: none; }
  }

  /* 列宽拖拽手柄——仅桌面双列出现，坐落在两列边界上 */
  .nw-resizer { display: none; }
  @container life-os-main (min-width: 840px) {
    .nw-resizer {
      display: block;
      position: absolute;
      inset-block: 0;
      inset-inline-start: var(--nw-list-w, 400px);
      width: 11px;
      transform: translateX(-50%);
      cursor: col-resize;
      z-index: 3;
      touch-action: none;
    }
    .nw-resizer::after {
      content: '';
      position: absolute;
      inset-block: 0;
      inset-inline-start: 50%;
      width: 2px;
      transform: translateX(-50%);
      background: transparent;
      transition: background var(--motion-fast) var(--ease);
    }
    .nw-resizer:hover::after,
    .nw-resizer:focus-visible::after,
    .nw.is-resizing .nw-resizer::after { background: var(--accent); }
  }
  .nw-resizer:focus-visible { outline: none; }

  /* 列表列 —— 自带滚动 */
  .nw-list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-2, 8px) 0;
    overflow-y: auto;
    /* 列表列比正文列微沉一档（secondary surface），配合分隔线让两列层级更清晰 */
    background: color-mix(in srgb, var(--t1, var(--text)) 2.5%, transparent);
    border-inline-end: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--t1, var(--text)) 18%, transparent) transparent;
  }
  .nw-list__head {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding-inline: var(--space-1, 4px);
  }
  .nw-list__head :global(.field),
  .nw-list__head :global([role='search']) { flex: 1; min-width: 0; }
  .nw-new {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 36px;
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-control, 8px);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-sm, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: filter var(--motion-fast) var(--ease);
  }
  .nw-new:hover { filter: brightness(1.08); }
  /* 标签行单行水平滚动，别让它把工具区撑高 */
  .nw-chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-inline: var(--space-1, 4px);
    scrollbar-width: none;
  }
  .nw-chips::-webkit-scrollbar { display: none; }
  .nw-chips .chip { flex: 0 0 auto; }
  .nw-list__body {
    flex: 1;
    min-height: 0;
    padding-bottom: var(--space-4, 16px);
  }
  .nw-group + .nw-group { margin-top: var(--space-4, 16px); }
  .nw-group__label {
    font-size: var(--text-2xs, 10px);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--t3, var(--text-muted));
    margin-bottom: var(--space-2, 8px);
    padding-inline: var(--space-1, 4px);
  }
  /* 列表列窄 —— 卡片单列堆叠 */
  .nw-list :global(.note-grid) { grid-template-columns: 1fr; }
  .nw-tagmore {
    color: var(--t2, var(--text-secondary));
    font-weight: 600;
  }
  /* 标签 overflow popover（门户到 body） */
  :global(.nw-tagpop__backdrop) {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  :global(.nw-tagpop) {
    position: fixed;
    z-index: 61;
    width: 300px;
    max-width: calc(100vw - 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
    border-radius: var(--radius-panel, 12px);
    background: var(--surface, var(--bg));
    border: 1px solid var(--border);
    box-shadow: var(--shadow-pop, 0 8px 28px rgba(0, 0, 0, 0.22));
  }
  :global(.nw-tagpop__search) {
    width: 100%;
    height: 32px;
    padding: 0 var(--space-2, 8px);
    border: 1px solid var(--border);
    border-radius: var(--radius-control, 8px);
    background: var(--field-bg, transparent);
    color: var(--t1, var(--text));
    font: inherit;
    font-size: var(--text-sm, 12px);
    outline: none;
  }
  :global(.nw-tagpop__search:focus) { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  :global(.nw-tagpop__scroll) {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    max-height: 360px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  :global(.nw-tagpop__grp) {
    margin: var(--space-1, 4px) 0 0;
    font-size: var(--text-2xs, 10px);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--t3, var(--text-muted));
  }
  :global(.nw-tagpop__grp:first-child) { margin-top: 0; }
  :global(.nw-tagpop__list) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1-5, 6px);
  }
  :global(.nw-tagpop__empty) {
    margin: 0;
    padding: var(--space-2, 8px);
    font-size: var(--text-sm, 12px);
    color: var(--t3, var(--text-muted));
  }
  :global(.nw-tagpop__clear) {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: var(--text-sm, 12px);
    font-weight: 600;
    cursor: pointer;
    padding: 2px 0;
  }
  /* 「筛选」前缀标签——把这排 chip 明确成过滤控件，而非被动标签 */
  .nw-filter-label {
    flex: 0 0 auto;
    align-self: center;
    font-size: var(--text-2xs, 10px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--t3, var(--text-muted));
    padding-inline-end: 2px;
  }
  .nw-filter-clear {
    color: var(--accent);
    font-weight: 600;
  }
  /* 当前笔记被筛掉时的提示条（正文保留、给出解释，避免「凭空消失」困惑） */
  .nw-filter-note {
    margin: var(--space-2, 8px) 64px 0;
    padding: var(--space-1-5, 6px) var(--space-3, 12px);
    border-radius: var(--radius-control, 8px);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: color-mix(in srgb, var(--accent) 72%, var(--t1, var(--text)));
    font-size: var(--text-sm, 12px);
  }

  /* 文档列 —— 由内部 .ed-pane 管滚动 */
  .nw-doc {
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .nw-doc :global(.ed-pane) { flex: 1; min-height: 0; }
  .nw-back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    align-self: flex-start;
    margin: var(--space-2, 8px) var(--space-3, 12px) 0;
    padding: var(--space-1, 4px) var(--space-2, 8px);
    border: none;
    border-radius: var(--radius-control, 8px);
    background: transparent;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm, 12px);
    cursor: pointer;
  }
  .nw-back:hover { background: color-mix(in srgb, var(--t1, var(--text)) 6%, transparent); color: var(--t1, var(--text)); }
  /* 桌面双列不需要返回键（放在基样式之后覆盖） */
  @container life-os-main (min-width: 840px) {
    .nw-back { display: none; }
  }
  .nw-empty {
    flex: 1;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--space-4, 16px);
    padding: var(--space-6, 24px);
  }
</style>
