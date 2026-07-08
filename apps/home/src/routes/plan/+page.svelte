<script>
  import { goto } from '$app/navigation'
  import { canRedoLayout, canUndoLayout, getActiveProject, getPlanSubtitle, redoLayoutEdit, setPlanSubtitle, undoLayoutEdit } from '$lib/state.svelte.js'
  import { isSpatialStudioEnabled } from '$lib/spatial-studio.js'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import RoomDimensionsEditor from '$lib/components/RoomDimensionsEditor.svelte'
  import PlanEditInspector from '$lib/components/PlanEditInspector.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'

  const project = $derived(getActiveProject())
  const studio = $derived(isSpatialStudioEnabled())

  let editMode = $state(false)
  let selectedWall = $state('')
  let selectedOpening = $state('')

  /** @param {string} code */
  function selectZone(code) {
    goto(`/storage?zone=${encodeURIComponent(code)}`)
  }

  function clearSelection() {
    selectedWall = ''
    selectedOpening = ''
  }

  $effect(() => {
    if (!studio) {
      setPlanSubtitle('')
      editMode = false
      clearSelection()
      return
    }
    setPlanSubtitle(
      editMode ? '拖拽内墙与门窗；标注随光标更新' : '储藏区可点击 · 可切换编辑户型',
    )
  })

  $effect(() => {
    if (!studio) return
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key === 'Escape' && editMode) {
        if (selectedWall || selectedOpening) clearSelection()
        else editMode = false
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = e.target instanceof Element ? e.target.tagName : ''
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (!canUndoLayout()) return
        e.preventDefault()
        undoLayoutEdit()
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) ||
        (e.ctrlKey && e.key === 'y')
      ) {
        const tag = e.target instanceof Element ? e.target.tagName : ''
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (!canRedoLayout()) return
        e.preventDefault()
        redoLayoutEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

{#if studio}
  <div class="plan-mode-bar" role="group" aria-label="平面显示模式">
    <div class="mode-segment">
      <button
        type="button"
        class="mode-btn"
        class:active={!editMode}
        aria-pressed={!editMode}
        onclick={() => {
          editMode = false
          clearSelection()
        }}
      >
        浏览
      </button>
      <button
        type="button"
        class="mode-btn"
        class:active={editMode}
        aria-pressed={editMode}
        onclick={() => {
          editMode = true
        }}
      >
        编辑户型
      </button>
    </div>
    <span class="studio-badge" title="内部功能，对外默认隐藏">工坊</span>
    {#if editMode}
      <p class="mode-kbd" aria-label="快捷键">
        <kbd>Esc</kbd><span>取消选中 / 退出编辑</span>
        <kbd>⌘Z</kbd><span>撤销</span>
        <kbd>⌘⇧Z</kbd><span>重做</span>
      </p>
    {/if}
  </div>
{/if}

<div class="plan-grid" class:plan-grid-full={!studio}>
  <div class="plan-main">
    <FloorPlanViewer
      {project}
      hideFurniture={!studio}
      editMode={studio && editMode}
      {selectedWall}
      {selectedOpening}
      onZoneSelect={studio && editMode ? undefined : selectZone}
      onSelectWall={(id) => {
        selectedWall = id
        selectedOpening = ''
      }}
      onSelectOpening={(id) => {
        selectedOpening = id
        selectedWall = ''
      }}
    />
    <PlanLegend interactive={studio && !editMode} editMode={studio && editMode} showFurniture={studio} />
  </div>
  {#if studio}
    <aside class="plan-aside">
      {#if editMode}
        <PlanEditInspector
          {selectedWall}
          {selectedOpening}
          onClear={clearSelection}
        />
      {:else}
        <RoomDimensionsEditor />
      {/if}
    </aside>
  {/if}
</div>

<style>
  .plan-mode-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 14px;
    margin-bottom: 14px;
  }

  .mode-segment {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    gap: 2px;
  }

  .mode-btn {
    font-size: 13px;
    font-weight: 650;
    min-height: 40px;
    padding: 8px 16px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .mode-btn.active {
    background: var(--accent);
    color: #f5f8fa;
    box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .studio-badge {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }

  .mode-kbd {
    flex: 1 1 100%;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    font-size: 11px;
    color: var(--t3);
    font-family: var(--mono);
  }

  .mode-kbd kbd {
    font-size: 10px;
    font-weight: 650;
    padding: 2px 6px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t2);
    font-family: inherit;
  }

  .mode-kbd span {
    margin-right: 4px;
    color: var(--t3);
  }

  .plan-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    gap: 20px;
    align-items: start;
  }

  .plan-grid-full {
    grid-template-columns: 1fr;
  }

  .plan-main {
    min-width: 0;
  }

  .plan-aside {
    position: sticky;
    top: 12px;
    max-height: calc(100dvh - 120px);
    overflow: auto;
  }

  @media (max-width: 1024px) {
    .plan-grid {
      grid-template-columns: 1fr;
    }

    .plan-aside {
      position: static;
      max-height: none;
    }
  }
</style>
