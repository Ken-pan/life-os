<script>
  import { goto } from '$app/navigation'
  import {
    activateWallGraphMode,
    addGraphWall,
    canRedoGraph,
    canRedoLayout,
    canUndoGraph,
    canUndoLayout,
    getActiveProject,
    getPlanSubtitle,
    isOpeningDisabled,
    isWallGraphMode,
    redoGraphEdit,
    redoLayoutEdit,
    removeGraphWall,
    revertToParametric508,
    setOpeningDisabled,
    setPlanSubtitle,
    undoGraphEdit,
    undoLayoutEdit,
  } from '$lib/state.svelte.js'
  import { isSpatialStudioEnabled } from '$lib/spatial-studio.js'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import RoomDimensionsEditor from '$lib/components/RoomDimensionsEditor.svelte'
  import PlanEditInspector from '$lib/components/PlanEditInspector.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'
  import PlanShortcutsHelp from '$lib/components/PlanShortcutsHelp.svelte'

  const project = $derived(getActiveProject())
  const studio = $derived(isSpatialStudioEnabled())
  const wallGraph = $derived(isWallGraphMode())

  /** @type {'browse' | 'edit' | 'measure' | 'graph'} */
  let planMode = $state('browse')
  /** @type {import('$lib/plan-graph-edit.js').GraphTool} */
  let graphTool = $state('wallAdd')
  let selectedWall = $state('')
  let selectedOpening = $state('')
  let selectedEdge = $state('')
  let showHelp = $state(false)
  let fitSignal = $state(0)
  let drawerOpen = $state(false)

  /** @type {{ a: { x: number, y: number } | null, b: { x: number, y: number } | null }} */
  let measurePoints = $state({ a: null, b: null })
  /** @type {{ x: number, y: number } | null} */
  let wallChainFrom = $state(null)
  /** @type {{ x: number, y: number } | null} */
  let wallChainHover = $state(null)

  const editMode = $derived(!wallGraph && planMode === 'edit')
  const measureMode = $derived(planMode === 'measure')
  const graphEditMode = $derived(wallGraph && planMode === 'graph')

  const drawerLabel = $derived(
    graphEditMode
      ? '墙图'
      : editMode
        ? '检查器'
        : measureMode
          ? '测距'
          : '房间',
  )

  /** @param {string} code */
  function selectZone(code) {
    goto(`/storage?zone=${encodeURIComponent(code)}`)
  }

  function clearSelection() {
    selectedWall = ''
    selectedOpening = ''
  }

  function clearMeasure() {
    measurePoints = { a: null, b: null }
  }

  /** @param {{ x: number, y: number }} pt */
  function onMeasurePoint(pt) {
    if (!measurePoints.a) {
      measurePoints = { a: pt, b: null }
      return
    }
    if (!measurePoints.b) {
      measurePoints = { a: measurePoints.a, b: pt }
      return
    }
    measurePoints = { a: pt, b: null }
  }

  function clearGraphChain() {
    wallChainFrom = null
    wallChainHover = null
  }

  /** @param {{ x: number, y: number }} pt */
  function onGraphWallPoint(pt) {
    if (graphTool !== 'wallAdd') return
    if (!wallChainFrom) {
      wallChainFrom = pt
      return
    }
    if (addGraphWall(wallChainFrom.x, wallChainFrom.y, pt.x, pt.y)) {
      wallChainFrom = pt
    }
  }

  function setPlanMode(/** @type {'browse' | 'edit' | 'measure' | 'graph'} */ mode) {
    planMode = mode
    if (mode !== 'edit') clearSelection()
    if (mode !== 'measure') clearMeasure()
    if (mode !== 'graph') {
      clearGraphChain()
      selectedEdge = ''
    }
    if (mode === 'browse') drawerOpen = false
    fitSignal += 1
  }

  function exitWallGraphTo508() {
    revertToParametric508()
    setPlanMode('browse')
    clearGraphChain()
    selectedEdge = ''
  }

  function enterGraphEdit(/** @type {import('$lib/plan-graph-edit.js').GraphTool} */ tool = 'wallAdd') {
    setPlanMode('graph')
    graphTool = tool
  }

  $effect(() => {
    if (!wallGraph && planMode === 'graph') {
      planMode = 'browse'
    }
  })

  $effect(() => {
    if (!studio) {
      setPlanSubtitle('')
      planMode = 'browse'
      clearSelection()
      clearMeasure()
      return
    }
    setPlanSubtitle(
      wallGraph
        ? planMode === 'graph'
          ? graphTool === 'wallAdd'
            ? '墙图建墙：点击拐点连线 · 1″ 吸附'
            : graphTool === 'remove'
              ? '墙图删墙：点击墙段删除'
              : '墙图：选择墙段'
          : planMode === 'measure'
            ? '测距：点击两点，不改变户型'
            : '自由墙图 · 房间标注沿用 508 导入时数据'
        : planMode === 'edit'
          ? '拖拽内墙与门窗；Delete 可隐藏选中开口'
          : planMode === 'measure'
            ? '测距：点击两点，不改变户型'
            : '储藏区可点击 · 可切换编辑或测距',
    )
  })

  $effect(() => {
    if (!studio) return
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      const tag = e.target instanceof Element ? e.target.tagName : ''
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === '?' && !inField) {
        e.preventDefault()
        showHelp = !showHelp
        return
      }

      if ((e.key === 'w' || e.key === 'W') && !inField && !e.metaKey && !e.ctrlKey && wallGraph) {
        e.preventDefault()
        enterGraphEdit('wallAdd')
        return
      }

      if ((e.key === 'm' || e.key === 'M') && !inField && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setPlanMode(planMode === 'measure' ? 'browse' : 'measure')
        return
      }

      if ((e.key === 'e' || e.key === 'E') && !inField && !e.metaKey && !e.ctrlKey && !wallGraph) {
        e.preventDefault()
        setPlanMode(planMode === 'edit' ? 'browse' : 'edit')
        return
      }

      if ((e.key === 'f' || e.key === 'F') && !inField && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        fitSignal += 1
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
        if (planMode === 'graph') {
          if (selectedEdge) selectedEdge = ''
          else if (wallChainFrom) clearGraphChain()
          else setPlanMode('browse')
          return
        }
        if (planMode === 'measure' && (measurePoints.a || measurePoints.b)) {
          clearMeasure()
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
        graphEditMode &&
        selectedEdge &&
        !inField
      ) {
        e.preventDefault()
        removeGraphWall(selectedEdge)
        selectedEdge = ''
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
        if (inField) return
        if (wallGraph && canUndoGraph()) {
          e.preventDefault()
          undoGraphEdit()
          return
        }
        if (!canUndoLayout()) return
        e.preventDefault()
        undoLayoutEdit()
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) ||
        (e.ctrlKey && e.key === 'y')
      ) {
        if (inField) return
        if (wallGraph && canRedoGraph()) {
          e.preventDefault()
          redoGraphEdit()
          return
        }
        if (!canRedoLayout()) return
        e.preventDefault()
        redoLayoutEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div class="plan-page">
{#if studio}
  <div class="plan-mode-bar" role="group" aria-label="平面显示模式">
    <p class="plan-mode-sub" aria-live="polite">{getPlanSubtitle() || '储藏区可点击'}</p>
    <div class="mode-segment">
      <button
        type="button"
        class="mode-btn"
        class:active={planMode === 'browse'}
        aria-pressed={planMode === 'browse'}
        onclick={() => setPlanMode('browse')}
      >
        浏览
      </button>
      {#if wallGraph}
        {#if planMode === 'graph'}
          <button
            type="button"
            class="mode-btn"
            class:active={graphTool === 'wallAdd'}
            aria-pressed={graphTool === 'wallAdd'}
            onclick={() => enterGraphEdit('wallAdd')}
          >
            建墙
          </button>
          <button
            type="button"
            class="mode-btn"
            class:active={graphTool === 'remove'}
            aria-pressed={graphTool === 'remove'}
            onclick={() => enterGraphEdit('remove')}
          >
            删墙
          </button>
        {/if}
      {:else}
        <button
          type="button"
          class="mode-btn"
          class:active={planMode === 'edit'}
          aria-pressed={planMode === 'edit'}
          onclick={() => setPlanMode('edit')}
        >
          编辑户型
        </button>
      {/if}
      <button
        type="button"
        class="mode-btn"
        class:active={planMode === 'measure'}
        aria-pressed={planMode === 'measure'}
        onclick={() => setPlanMode(planMode === 'measure' ? 'browse' : 'measure')}
      >
        测距
      </button>
    </div>
    {#if wallGraph && planMode !== 'graph'}
      <button type="button" class="graph-edit-btn" onclick={() => enterGraphEdit('wallAdd')}>
        墙图编辑
      </button>
    {/if}
    <span class="studio-badge" title="内部功能，对外默认隐藏">
      {wallGraph ? '墙图' : '工坊'}
    </span>
    {#if wallGraph}
      <button type="button" class="graph-revert-btn" onclick={exitWallGraphTo508}>
        返回 508
      </button>
    {:else}
      <button type="button" class="graph-enable-btn" onclick={() => {
        activateWallGraphMode()
        enterGraphEdit('wallAdd')
      }}>
        自由墙图
      </button>
    {/if}
    <button type="button" class="help-btn" onclick={() => (showHelp = !showHelp)} aria-label="快捷键帮助">
      ?
    </button>
    {#if planMode !== 'browse'}
      <p class="mode-kbd" aria-label="快捷键">
        {#if planMode === 'graph'}
          <kbd>W</kbd><span>建墙</span>
          <kbd>Delete</kbd><span>删选中墙</span>
          <kbd>Esc</kbd><span>清除链点 / 退出</span>
        {:else if planMode === 'edit'}
          <kbd>Esc</kbd><span>取消选中 / 退出编辑</span>
          <kbd>Delete</kbd><span>隐藏门窗</span>
          <kbd>⌘Z</kbd><span>撤销</span>
        {:else}
          <kbd>Esc</kbd><span>清除测距</span>
          <kbd>点击</kbd><span>选两点量距离</span>
        {/if}
        <kbd>F</kbd><span>适配视图</span>
      </p>
    {/if}
  </div>
{/if}

<PlanShortcutsHelp open={showHelp} onClose={() => (showHelp = false)} />

  <div class="plan-stage">
    <FloorPlanViewer
      {project}
      canvasPriority
      hideFurniture={!studio}
      editMode={studio && editMode}
      measureMode={studio && measureMode}
      graphEditMode={studio && graphEditMode}
      {graphTool}
      {measurePoints}
      {fitSignal}
      {selectedWall}
      {selectedOpening}
      {selectedEdge}
      {wallChainFrom}
      {wallChainHover}
      onZoneSelect={studio && planMode === 'browse' ? selectZone : undefined}
      onMeasurePoint={studio && measureMode ? onMeasurePoint : undefined}
      onGraphWallPoint={studio && graphEditMode ? onGraphWallPoint : undefined}
      onGraphRemoveEdge={(id) => removeGraphWall(id)}
      onGraphSelectEdge={(id) => {
        selectedEdge = id
        drawerOpen = true
      }}
      onGraphHover={(pt) => {
        wallChainHover = pt
      }}
      onSelectWall={(id) => {
        selectedWall = id
        selectedOpening = ''
        drawerOpen = true
      }}
      onSelectOpening={(id) => {
        selectedOpening = id
        selectedWall = ''
        drawerOpen = true
      }}
    />
    <PlanLegend
      overlay
      interactive={studio && planMode === 'browse'}
      editMode={studio && editMode}
      graphEditMode={studio && graphEditMode}
      showFurniture={studio}
    />

    {#if studio}
      <button
        type="button"
        class="plan-drawer-fab"
        class:open={drawerOpen}
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
        <aside id="plan-drawer" class="plan-drawer" aria-label="平面编辑面板">
          <header class="plan-drawer-head">
            <h2 class="plan-drawer-title">{drawerLabel}</h2>
            <button
              type="button"
              class="plan-drawer-close"
              onclick={() => (drawerOpen = false)}
              aria-label="关闭面板"
            >×</button>
          </header>
          <div class="plan-drawer-body">
            {#if graphEditMode}
              <section class="graph-aside" aria-label="墙图编辑">
                <p class="graph-lead">
                  node-edge 墙图：从 508 种子化，可增删直线墙段（1″ 吸附）。
                </p>
                <div class="graph-stats">
                  <span>顶点 {project.wallGraph?.vertices.length ?? 0}</span>
                  <span>墙段 {project.wallGraph?.edges.length ?? 0}</span>
                </div>
                <div class="graph-actions">
                  <button
                    type="button"
                    class="graph-btn"
                    disabled={!canUndoGraph()}
                    onclick={undoGraphEdit}
                  >撤销</button>
                  <button
                    type="button"
                    class="graph-btn"
                    disabled={!canRedoGraph()}
                    onclick={redoGraphEdit}
                  >重做</button>
                </div>
                {#if wallChainFrom}
                  <button type="button" class="graph-btn" onclick={clearGraphChain}
                    >清除建墙链点</button
                  >
                {/if}
                {#if selectedEdge}
                  <button
                    type="button"
                    class="graph-btn graph-btn-warn"
                    onclick={() => {
                      removeGraphWall(selectedEdge)
                      selectedEdge = ''
                    }}
                  >删除选中墙段</button>
                {/if}
                <ul class="graph-list">
                  <li>建墙：连续点击拐点连线</li>
                  <li>删墙：点「删墙」后点击墙线</li>
                </ul>
              </section>
            {:else if editMode}
              <PlanEditInspector
                {selectedWall}
                {selectedOpening}
                onClear={clearSelection}
              />
            {:else if measureMode}
              <section class="measure-aside" aria-label="测距说明">
                <p class="measure-lead">
                  在平面图上依次点击两点显示距离。第三次点击重新开始；不改变户型数据。
                </p>
                {#if measurePoints.a && measurePoints.b}
                  <button type="button" class="measure-clear" onclick={clearMeasure}
                    >清除测距线</button
                  >
                {/if}
              </section>
            {:else}
              <RoomDimensionsEditor />
            {/if}
          </div>
        </aside>
      {/if}
    {/if}
  </div>
</div>

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

  .plan-mode-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-bottom: 8px;
    flex-shrink: 0;
  }

  .plan-mode-sub {
    flex: 1 1 100%;
    margin: 0;
    font-size: 12px;
    color: var(--t3);
    font-family: var(--mono);
  }

  @media (min-width: 720px) {
    .plan-mode-sub {
      flex: 1 1 auto;
      order: 10;
      text-align: right;
      margin-left: auto;
    }
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

  .mode-segment .mode-btn:nth-child(3).active {
    background: #1d6b42;
    box-shadow: 0 2px 8px -2px rgba(29, 107, 66, 0.45);
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

  .graph-enable-btn,
  .graph-revert-btn,
  .graph-edit-btn {
    font-size: 12px;
    font-weight: 650;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    cursor: pointer;
  }

  .graph-edit-btn {
    background: color-mix(in srgb, #1d6b42 12%, var(--card));
    color: #1d6b42;
    border-color: color-mix(in srgb, #1d6b42 35%, var(--border));
  }

  .graph-enable-btn {
    background: color-mix(in srgb, #1d6b42 12%, var(--card));
    color: #1d6b42;
    border-color: color-mix(in srgb, #1d6b42 35%, var(--border));
  }

  .graph-revert-btn {
    background: var(--card);
    color: var(--t2);
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
    bottom: calc(var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 14px);
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
    bottom: calc(var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 8px);
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
  .plan-drawer-body :global(.dim-editor),
  .plan-drawer-body :global(.graph-aside),
  .plan-drawer-body :global(.measure-aside) {
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

    .plan-mode-bar {
      gap: 8px;
    }

    .mode-segment {
      flex: 1 1 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .mode-segment::-webkit-scrollbar {
      display: none;
    }

    .mode-kbd {
      display: none;
    }
  }

  .measure-aside {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    background: var(--card);
  }

  .measure-lead {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.5;
  }

  .measure-clear {
    margin-top: 12px;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent);
    cursor: pointer;
  }

  .graph-aside {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    background: var(--card);
  }

  .graph-lead {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.5;
  }

  .graph-stats {
    display: flex;
    gap: 12px;
    font-size: 12px;
    font-family: var(--mono);
    color: var(--accent);
    margin-bottom: 10px;
  }

  .graph-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .graph-btn {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent);
    cursor: pointer;
  }

  .graph-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    color: var(--t3);
  }

  .graph-btn-warn {
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  .graph-list {
    margin: 10px 0 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--t3);
    line-height: 1.55;
  }

  .graph-aside,
  .measure-aside {
    padding: 14px 16px;
  }
</style>
