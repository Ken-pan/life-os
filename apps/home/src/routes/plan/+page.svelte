<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import {
    canRedoLayout,
    canUndoLayout,
    getActiveProject,
    getPlanSubtitle,
    isOpeningDisabled,
    redoLayoutEdit,
    setOpeningDisabled,
    setPlanSubtitle,
    undoLayoutEdit,
  } from '$lib/state.svelte.js'
  import { browser } from '$app/environment'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import RoomDimensionsEditor from '$lib/components/RoomDimensionsEditor.svelte'
  import PlanEditInspector from '$lib/components/PlanEditInspector.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'
  import PlanSelectionBar from '$lib/components/PlanSelectionBar.svelte'
  import PlanContextMenu from '$lib/components/PlanContextMenu.svelte'
  import PlanShortcutsHelp from '$lib/components/PlanShortcutsHelp.svelte'

  const project = $derived(getActiveProject())

  /** @type {'browse' | 'edit'} */
  let planMode = $state('browse')
  let selectedWall = $state('')
  let selectedOpening = $state('')
  let showHelp = $state(false)
  let fitRequest = $state({ token: 0, cycle: false })
  let drawerOpen = $state(false)
  let ctxMenu = $state({ open: false, x: 0, y: 0 })

  const editMode = $derived(planMode === 'edit')
  const canUndo = $derived(canUndoLayout())
  const canRedo = $derived(canRedoLayout())
  const hasEditHistory = $derived(canUndo || canRedo)
  const showSelectionBar = $derived(
    editMode && (selectedWall || selectedOpening),
  )
  const hideFabForBar = $derived(showSelectionBar)
  const drawerLabel = $derived(editMode ? '调整' : '房间')

  const modeHint = $derived(
    planMode === 'edit'
      ? '拖曳内墙与门窗调整户型 · Delete 隐藏门窗'
      : '点击储藏区查看物品 · 双指缩放平移',
  )

  function bumpFit(
    /** @type {boolean} */ cycle = false,
    /** @type {'contain' | 'width' | undefined} */ mode = undefined,
  ) {
    fitRequest = { token: fitRequest.token + 1, cycle, mode }
  }

  onMount(() => {
    bumpFit(false, 'contain')
  })

  /** @param {string} code */
  function selectZone(code) {
    goto(`/storage?zone=${encodeURIComponent(code)}`)
  }

  function clearSelection() {
    selectedWall = ''
    selectedOpening = ''
  }

  function openDrawerForSelection() {
    if (browser && window.matchMedia('(max-width: 599px)').matches) {
      drawerOpen = true
    }
  }

  /** @param {{ x: number, y: number }} pt */
  function onBlankContextMenu(pt) {
    ctxMenu = { open: true, x: pt.x, y: pt.y }
  }

  const ctxMenuItems = $derived.by(() => {
    /** @type {{ id: string, label: string, action: () => void }[]} */
    const items = []
    if (planMode !== 'edit') {
      items.push({
        id: 'edit',
        label: '编辑',
        action: () => setPlanMode('edit'),
      })
    }
    if (planMode !== 'browse') {
      items.push({
        id: 'browse',
        label: '浏览',
        action: () => setPlanMode('browse'),
      })
    }
    if (selectedWall || selectedOpening) {
      items.push({
        id: 'clear',
        label: '取消选中',
        action: () => clearSelection(),
      })
    }
    return items
  })

  /** @param {'browse' | 'edit'} mode */
  function setPlanMode(mode) {
    planMode = mode
    if (mode !== 'edit') clearSelection()
    if (mode === 'browse') drawerOpen = false
    bumpFit(false)
  }

  $effect(() => {
    setPlanSubtitle(modeHint)
  })

  $effect(() => {
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      const tag = e.target instanceof Element ? e.target.tagName : ''
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === '?' && !inField) {
        e.preventDefault()
        showHelp = !showHelp
        return
      }

      if (
        (e.key === 'e' || e.key === 'E') &&
        !inField &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault()
        setPlanMode(planMode === 'edit' ? 'browse' : 'edit')
        return
      }

      if (
        (e.key === 'f' || e.key === 'F') &&
        !inField &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault()
        bumpFit(true)
        return
      }

      if (e.key === 'Escape') {
        if (showHelp) {
          showHelp = false
          return
        }
        if (drawerOpen) {
          drawerOpen = false
          return
        }
        if (planMode === 'edit') {
          if (selectedWall || selectedOpening) clearSelection()
          else setPlanMode('browse')
        }
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        planMode === 'edit' &&
        selectedOpening &&
        !inField
      ) {
        e.preventDefault()
        if (!isOpeningDisabled(selectedOpening)) {
          setOpeningDisabled(selectedOpening, true)
          clearSelection()
        }
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (inField || !canUndoLayout()) return
        e.preventDefault()
        undoLayoutEdit()
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) ||
        (e.ctrlKey && e.key === 'y')
      ) {
        if (inField || !canRedoLayout()) return
        e.preventDefault()
        redoLayoutEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div class="plan-page">
  <header class="plan-top" aria-label="平面图模式">
    <div class="mode-segment" role="group" aria-label="浏览或编辑">
      <button
        type="button"
        class="mode-btn"
        class:active={planMode === 'browse'}
        aria-pressed={planMode === 'browse'}
        onclick={() => setPlanMode('browse')}
      >
        浏览
      </button>
      <button
        type="button"
        class="mode-btn"
        class:active={planMode === 'edit'}
        aria-pressed={planMode === 'edit'}
        onclick={() => setPlanMode('edit')}
      >
        编辑
      </button>
    </div>

    {#if editMode && hasEditHistory}
      <div class="mode-history" role="group" aria-label="编辑历史">
        <button
          type="button"
          class="mode-undo-btn"
          disabled={!canUndo}
          title="撤销 (⌘Z)"
          aria-label="撤销"
          onclick={undoLayoutEdit}>↶</button
        >
        <button
          type="button"
          class="mode-undo-btn"
          disabled={!canRedo}
          title="重做"
          aria-label="重做"
          onclick={redoLayoutEdit}>↷</button
        >
      </div>
    {/if}

    <button
      type="button"
      class="help-btn"
      onclick={() => (showHelp = !showHelp)}
      aria-label="快捷键帮助"
    >
      ?
    </button>

    <p class="plan-hint-line" aria-live="polite">
      {getPlanSubtitle() || modeHint}
    </p>
  </header>

  <PlanShortcutsHelp open={showHelp} onClose={() => (showHelp = false)} />

  <div class="plan-stage">
    <FloorPlanViewer
      {project}
      canvasPriority
      hideFurniture
      editMode={editMode}
      {fitRequest}
      {selectedWall}
      {selectedOpening}
      onZoneSelect={planMode === 'browse' ? selectZone : undefined}
      onClearSelection={editMode ? clearSelection : undefined}
      onSelectWall={(id) => {
        selectedWall = id
        selectedOpening = ''
        openDrawerForSelection()
      }}
      onSelectOpening={(id) => {
        selectedOpening = id
        selectedWall = ''
        openDrawerForSelection()
      }}
      onBlankContextMenu={onBlankContextMenu}
    />
    {#if showSelectionBar}
      <PlanSelectionBar
        {selectedWall}
        {selectedOpening}
        onClear={clearSelection}
        onOpenDetails={() => (drawerOpen = true)}
      />
    {/if}
    <PlanLegend overlay interactive={planMode === 'browse'} {editMode} />

    <button
      type="button"
      class="plan-drawer-fab"
      class:open={drawerOpen}
      class:hide-for-bar={hideFabForBar && !drawerOpen}
      aria-expanded={drawerOpen}
      aria-controls="plan-drawer"
      onclick={() => (drawerOpen = !drawerOpen)}
    >
      {drawerOpen ? '收起' : drawerLabel}
    </button>

    {#if drawerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="plan-drawer-backdrop"
        onclick={() => (drawerOpen = false)}
        role="presentation"
      ></div>
      <aside id="plan-drawer" class="plan-drawer" aria-label="平面侧面板">
        <header class="plan-drawer-head">
          <h2 class="plan-drawer-title">{drawerLabel}</h2>
          <button
            type="button"
            class="plan-drawer-close"
            onclick={() => (drawerOpen = false)}
            aria-label="关闭面板">×</button
          >
        </header>
        <div class="plan-drawer-body">
          {#if editMode}
            <PlanEditInspector
              {selectedWall}
              {selectedOpening}
              onClear={clearSelection}
            />
          {:else}
            <RoomDimensionsEditor />
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</div>

<PlanContextMenu
  open={ctxMenu.open}
  x={ctxMenu.x}
  y={ctxMenu.y}
  items={ctxMenuItems}
  onClose={() => (ctxMenu = { open: false, x: 0, y: 0 })}
/>

<style>
  .plan-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 0;
  }

  .plan-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    margin-bottom: 10px;
    padding: 8px 10px;
    flex-shrink: 0;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    background: color-mix(in srgb, var(--card) 90%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px -12px rgba(0, 0, 0, 0.18);
  }

  .plan-hint-line {
    flex: 1 1 100%;
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--t3);
    font-family: var(--mono);
  }

  @media (min-width: 720px) {
    .plan-hint-line {
      flex: 1 1 auto;
      order: 10;
      text-align: right;
      margin-left: auto;
    }
  }

  .mode-segment {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    gap: 3px;
  }

  .mode-btn {
    font-size: 14px;
    font-weight: 650;
    min-height: 40px;
    min-width: 72px;
    padding: 8px 18px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .mode-btn.active {
    background: var(--accent);
    color: #f5f8fa;
    box-shadow: 0 2px 10px -2px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .help-btn {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t2);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .mode-history {
    display: inline-flex;
    gap: 4px;
  }

  .mode-undo-btn {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--accent);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    line-height: 1;
  }

  .mode-undo-btn:disabled {
    opacity: 0.38;
    color: var(--t3);
    cursor: not-allowed;
  }

  .mode-undo-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 10%, var(--card));
  }

  .plan-stage {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 0;
    overflow: hidden;
  }

  .plan-stage :global(.plan-shell) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .plan-drawer-fab {
    position: fixed;
    z-index: 48;
    right: max(14px, var(--safe-right-effective));
    bottom: calc(
      var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 14px
    );
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--accent);
    font-size: 13px;
    font-weight: 650;
    box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.28);
    cursor: pointer;
  }

  .plan-drawer-fab.open {
    background: var(--accent);
    color: #f5f8fa;
    border-color: transparent;
  }

  .plan-drawer-fab.hide-for-bar {
    opacity: 0;
    pointer-events: none;
  }

  .plan-drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
    background: rgba(12, 16, 22, 0.38);
  }

  .plan-drawer {
    position: fixed;
    z-index: 50;
    top: calc(var(--appbar-height, 56px) + 8px);
    right: max(8px, var(--safe-right-effective));
    bottom: calc(
      var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 8px
    );
    width: min(380px, calc(100vw - 16px));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    box-shadow: 0 20px 48px -16px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .plan-drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .plan-drawer-title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    color: var(--t1);
  }

  .plan-drawer-close {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: var(--bg);
    color: var(--t2);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .plan-drawer-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }

  .plan-drawer-body :global(.inspector),
  .plan-drawer-body :global(.dim-editor) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .plan-drawer-body :global(.dim-grid) {
    grid-template-columns: 1fr;
  }

  @media (min-width: 900px) {
    .plan-drawer-fab {
      bottom: calc(var(--safe-bottom-effective) + 20px);
    }

    .plan-drawer {
      bottom: calc(var(--safe-bottom-effective) + 16px);
    }
  }

  @media (max-width: 599px) {
    .plan-drawer {
      top: auto;
      left: max(8px, var(--safe-left-effective));
      right: max(8px, var(--safe-right-effective));
      width: auto;
      max-height: min(72dvh, 560px);
      border-radius: 14px 14px 0 0;
    }

    .plan-top {
      gap: 8px;
    }

    .mode-segment {
      flex: 1 1 auto;
    }
  }

  @media (min-width: 600px) {
    .plan-drawer-backdrop {
      display: none;
    }

    .plan-drawer {
      top: auto;
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 88px
      );
      width: min(520px, calc(100vw - 32px));
      max-height: min(42vh, 400px);
    }

    .plan-stage:has(:global(.sel-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }
  }
</style>
