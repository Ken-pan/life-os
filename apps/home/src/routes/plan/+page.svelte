<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import {
    activateWallGraphMode,
    addGraphWall,
    addGraphOpening,
    commitGraphOpeningEdit,
    removeGraphOpening,
    previewGraphOpeningDrag,
    canRedoGraph,
    canRedoLayout,
    canUndoGraph,
    canUndoLayout,
    commitGraphVertexMove,
    getActiveProject,
    isOpeningDisabled,
    isWallGraphMode,
    previewGraphVertexMove,
    redoGraphEdit,
    redoLayoutEdit,
    removeGraphWall,
    setOpeningDisabled,
    setPlanSubtitle,
    splitGraphWall,
    undoGraphEdit,
    undoLayoutEdit,
  } from '$lib/state.svelte.js'
  import { buildFromWallGraph } from '$lib/spatial/wall-graph.js'
  import { browser } from '$app/environment'
  import FloorPlanViewer from '$lib/components/FloorPlanViewer.svelte'
  import RoomDimensionsEditor from '$lib/components/RoomDimensionsEditor.svelte'
  import PlanEditInspector from '$lib/components/PlanEditInspector.svelte'
  import PlanLegend from '$lib/components/PlanLegend.svelte'
  import PlanSelectionBar from '$lib/components/PlanSelectionBar.svelte'
  import PlanGraphSelectionBar from '$lib/components/PlanGraphSelectionBar.svelte'
  import PlanGraphOpeningSelectionBar from '$lib/components/PlanGraphOpeningSelectionBar.svelte'
  import PlanContextMenu from '$lib/components/PlanContextMenu.svelte'
  import PlanShortcutsHelp from '$lib/components/PlanShortcutsHelp.svelte'

  const project = $derived(getActiveProject())
  const wallGraph = $derived(isWallGraphMode())

  /** @type {'browse' | 'edit'} */
  let planMode = $state('browse')
  /** @type {'walls' | 'zones' | 'place'} */
  let editStep = $state('walls')
  /** @type {import('$lib/plan-graph-edit.js').GraphTool} */
  let graphTool = $state('wallAdd')
  let selectedWall = $state('')
  let selectedOpening = $state('')
  let selectedEdge = $state('')
  let showHelp = $state(false)
  let fitRequest = $state({ token: 0, cycle: false })
  let drawerOpen = $state(false)
  let ctxMenu = $state({ open: false, x: 0, y: 0 })
  /** @type {{ x: number, y: number } | null} */
  let wallChainFrom = $state(null)
  /** @type {{ x: number, y: number } | null} */
  let wallChainHover = $state(null)
  /** @type {import('$lib/spatial/types.js').WallGraph | null} */
  let graphPreviewGraph = $state(null)
  /** @type {import('$lib/spatial/types.js').GraphOpening[] | null} */
  let graphPreviewOpenings = $state(null)
  let compactPlanChrome = $state(false)

  const editMode508 = $derived(planMode === 'edit' && !wallGraph)
  const graphEditMode = $derived(
    wallGraph && planMode === 'edit' && editStep === 'walls',
  )
  const canUndo = $derived(
    graphEditMode ? canUndoGraph() : canUndoLayout(),
  )
  const canRedo = $derived(
    graphEditMode ? canRedoGraph() : canRedoLayout(),
  )
  const hasEditHistory = $derived(canUndo || canRedo)
  const showSelectionBar = $derived(
    editMode508 && (selectedWall || selectedOpening),
  )
  const showGraphSelectionBar = $derived(
    graphEditMode && Boolean(selectedEdge) && !selectedOpening,
  )
  const showGraphOpeningSelectionBar = $derived(
    graphEditMode && Boolean(selectedOpening),
  )
  const hideFabForBar = $derived(
    showSelectionBar || showGraphSelectionBar || showGraphOpeningSelectionBar,
  )
  const drawerLabel = $derived(
    graphEditMode ? '墙图' : editMode508 ? '调整' : '房间',
  )

  const viewerProject = $derived.by(() => {
    const graph = graphPreviewGraph ?? project.wallGraph
    const graphOpenings = graphPreviewOpenings ?? project.graphOpenings ?? []
    if (graph && (graphPreviewGraph || graphPreviewOpenings)) {
      return buildFromWallGraph(graph, { ...project, graphOpenings })
    }
    return project
  })

  const modeHint = $derived.by(() => {
    if (planMode === 'browse') {
      return '点击储藏区查看物品 · 双指缩放平移'
    }
    if (wallGraph && editStep === 'walls') {
      if (graphTool === 'wallAdd') {
        return '建墙：点击拐点连线 · Shift 正交 · 1″ 吸附 · Esc 断链'
      }
      if (graphTool === 'remove') return '删墙：点击墙段删除'
      if (graphTool === 'opening') return '门窗：点击墙段放置门（32″）'
      return '选择：点墙段/门窗 · 拖顶点或沿墙移动 · Delete 删除'
    }
    if (wallGraph) {
      if (editStep === 'zones') return '② 划分（H-W3 开放）'
      return '③ 布置（H-W4 开放）'
    }
    return '拖曳内墙与门窗调整户型 · Delete 隐藏门窗'
  })

  /** AppBar 单行副标题（不与画布工具条重复长文案） */
  const appBarSubtitle = $derived.by(() => {
    if (planMode === 'browse') return '储藏区可点击'
    if (graphEditMode) {
      if (graphTool === 'wallAdd') return '墙图 · 建墙'
      if (graphTool === 'opening') return '墙图 · 门窗'
      if (graphTool === 'remove') return '墙图 · 删墙'
      return '墙图 · 选择'
    }
    if (editMode508) return '508 参数编辑'
    return '编辑'
  })

  function bumpFit(
    /** @type {boolean} */ cycle = false,
    /** @type {'contain' | 'width' | undefined} */ mode = undefined,
  ) {
    fitRequest = { token: fitRequest.token + 1, cycle, mode }
  }

  onMount(() => {
    bumpFit(false, 'contain')
    if (!browser) return
    const mq = window.matchMedia('(max-width: 599px)')
    compactPlanChrome = mq.matches
    /** @param {MediaQueryListEvent} e */
    const onMq = (e) => {
      compactPlanChrome = e.matches
    }
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  })

  /** @param {string} code */
  function selectZone(code) {
    goto(`/storage?zone=${encodeURIComponent(code)}`)
  }

  function clearSelection() {
    selectedWall = ''
    selectedOpening = ''
    selectedEdge = ''
  }

  function clearGraphChain() {
    wallChainFrom = null
    wallChainHover = null
  }

  /** @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to */
  function orthoPoint(from, to) {
    const dx = Math.abs(to.x - from.x)
    const dy = Math.abs(to.y - from.y)
    return dx > dy ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
  }

  /** @param {{ x: number, y: number }} pt */
  function onGraphWallPoint(pt) {
    if (graphTool !== 'wallAdd') return
    const target =
      wallChainFrom && wallChainHover ? wallChainHover : pt
    if (!wallChainFrom) {
      wallChainFrom = target
      return
    }
    if (addGraphWall(wallChainFrom.x, wallChainFrom.y, target.x, target.y)) {
      wallChainFrom = target
    }
  }

  function performUndo() {
    if (graphEditMode) undoGraphEdit()
    else undoLayoutEdit()
  }

  function performRedo() {
    if (graphEditMode) redoGraphEdit()
    else redoLayoutEdit()
  }

  function openDrawerForSelection(
    /** @type {'edge' | '508' | 'graphOpening'} */ kind = '508',
  ) {
    if (kind === 'graphOpening') return
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
    if (mode === 'edit' && wallGraph) {
      editStep = 'walls'
      graphTool = 'wallAdd'
    }
    if (mode !== 'edit') {
      clearSelection()
      clearGraphChain()
    }
    if (mode === 'browse') drawerOpen = false
    graphPreviewGraph = null
    graphPreviewOpenings = null
    bumpFit(false)
  }

  /** @param {'walls' | 'zones' | 'place'} step */
  function setEditStep(step) {
    if (step === 'zones' || step === 'place') return
    editStep = step
    clearSelection()
    clearGraphChain()
    graphPreviewGraph = null
    graphPreviewOpenings = null
    bumpFit(false)
  }

  /** @param {import('$lib/plan-graph-edit.js').GraphTool} tool */
  function setGraphTool(tool) {
    graphTool = tool
    clearGraphChain()
    graphPreviewGraph = null
    graphPreviewOpenings = null
  }

  function convertToWallGraph() {
    activateWallGraphMode()
    editStep = 'walls'
    graphTool = 'wallAdd'
    if (planMode !== 'edit') planMode = 'edit'
    bumpFit(false)
  }

  $effect(() => {
    setPlanSubtitle(appBarSubtitle)
  })

  $effect(() => {
    if (graphEditMode && compactPlanChrome) {
      bumpFit(false, 'contain')
    }
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
        if (graphEditMode) {
          if (selectedOpening) selectedOpening = ''
          else if (selectedEdge) selectedEdge = ''
          else if (wallChainFrom) clearGraphChain()
          else if (graphPreviewGraph || graphPreviewOpenings) {
            graphPreviewGraph = null
            graphPreviewOpenings = null
          } else setPlanMode('browse')
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
        selectedOpening &&
        !inField
      ) {
        e.preventDefault()
        removeGraphOpening(selectedOpening)
        selectedOpening = ''
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
        editMode508 &&
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

      if (!inField && graphEditMode && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        if (e.key === '1') setGraphTool('select')
        if (e.key === '2') setGraphTool('wallAdd')
        if (e.key === '3') setGraphTool('remove')
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (inField) return
        if (graphEditMode && canUndoGraph()) {
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
        if (graphEditMode && canRedoGraph()) {
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
  <header
    class="plan-top"
    class:plan-top-edit={planMode === 'edit'}
    aria-label="平面图模式"
  >
    <div class="plan-top-primary">
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

      {#if editMode508 && hasEditHistory}
        <div class="mode-history" role="group" aria-label="编辑历史">
          <button
            type="button"
            class="mode-undo-btn"
            disabled={!canUndo}
            title="撤销 (⌘Z)"
            aria-label="撤销"
            onclick={performUndo}>↶</button
          >
          <button
            type="button"
            class="mode-undo-btn"
            disabled={!canRedo}
            title="重做"
            aria-label="重做"
            onclick={performRedo}>↷</button
          >
        </div>
      {:else if graphEditMode && hasEditHistory}
        <div class="mode-history" role="group" aria-label="编辑历史">
          <button
            type="button"
            class="mode-undo-btn"
            disabled={!canUndo}
            title="撤销 (⌘Z)"
            aria-label="撤销"
            onclick={performUndo}>↶</button
          >
          <button
            type="button"
            class="mode-undo-btn"
            disabled={!canRedo}
            title="重做"
            aria-label="重做"
            onclick={performRedo}>↷</button
          >
        </div>
      {/if}

      <button
        type="button"
        class="help-btn"
        onclick={() => (showHelp = !showHelp)}
        aria-label="快捷键与操作提示"
        title="快捷键与操作提示"
      >
        ?
      </button>
    </div>

    {#if planMode === 'edit'}
      <div class="edit-chrome-wrap">
        <div class="step-segment" role="group" aria-label="编辑步骤">
          <button
            type="button"
            class="step-btn"
            class:active={editStep === 'walls'}
            aria-pressed={editStep === 'walls'}
            onclick={() => setEditStep('walls')}
          >
            ① 墙体
          </button>
          <button
            type="button"
            class="step-btn"
            disabled
            title="即将推出：手绘分区"
          >
            ② 划分
          </button>
          <button
            type="button"
            class="step-btn"
            disabled
            title="即将推出：家具布置"
          >
            ③ 布置
          </button>
        </div>

        {#if graphEditMode}
          <div class="tool-segment-scroll" data-scroll-hint="tools">
            <div class="tool-segment" role="group" aria-label="墙图工具">
            <button
              type="button"
              class="step-btn"
              class:active={graphTool === 'select'}
              aria-pressed={graphTool === 'select'}
              onclick={() => setGraphTool('select')}
            >
              选择
            </button>
            <button
              type="button"
              class="step-btn"
              class:active={graphTool === 'wallAdd'}
              aria-pressed={graphTool === 'wallAdd'}
              onclick={() => setGraphTool('wallAdd')}
            >
              建墙
            </button>
            <button
              type="button"
              class="step-btn"
              class:active={graphTool === 'opening'}
              aria-pressed={graphTool === 'opening'}
              onclick={() => setGraphTool('opening')}
            >
              门窗
            </button>
            <button
              type="button"
              class="step-btn"
              class:active={graphTool === 'remove'}
              aria-pressed={graphTool === 'remove'}
              onclick={() => setGraphTool('remove')}
            >
            删墙
            </button>
          </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if editMode508}
      <p class="plan-convert-banner" role="note">
        此户型为参数模式，
        <button type="button" class="plan-convert-link" onclick={convertToWallGraph}>
          转换为墙图
        </button>
        后可自由建删墙
      </p>
    {/if}
  </header>

  <PlanShortcutsHelp
    open={showHelp}
    contextHint={modeHint}
    graphEditMode={graphEditMode}
    onClose={() => (showHelp = false)}
  />

  <div class="plan-stage">
    <FloorPlanViewer
      project={viewerProject}
      canvasPriority
      hideFurniture
      editMode={editMode508}
      graphEditMode={graphEditMode}
      toolbarMinimal={compactPlanChrome && planMode === 'edit'}
      {graphTool}
      {fitRequest}
      {selectedWall}
      {selectedOpening}
      {selectedEdge}
      {wallChainFrom}
      {wallChainHover}
      onZoneSelect={planMode === 'browse' ? selectZone : undefined}
      onClearSelection={editMode508 ? clearSelection : undefined}
      onGraphWallPoint={graphEditMode ? onGraphWallPoint : undefined}
      onGraphRemoveEdge={(id) => removeGraphWall(id)}
      onPlaceOpening={(pt, edgeId) => {
        const id = addGraphOpening(edgeId, pt, 'door')
        if (id) {
          selectedOpening = id
          selectedEdge = ''
          setGraphTool('select')
        }
      }}
      onGraphSelectEdge={(id) => {
        selectedEdge = id
        selectedOpening = ''
        openDrawerForSelection('edge')
      }}
      onGraphSelectOpening={(id) => {
        selectedOpening = id
        selectedEdge = ''
      }}
      onOpeningDragStart={() => {
        graphPreviewOpenings = project.graphOpenings ?? []
      }}
      onOpeningDrag={(id, pt, mode) => {
        if (!project.wallGraph) return
        graphPreviewOpenings = previewGraphOpeningDrag(
          project.wallGraph,
          project.graphOpenings ?? [],
          id,
          pt,
          mode,
        )
      }}
      onOpeningDrop={(id, pt, mode) => {
        graphPreviewOpenings = null
        commitGraphOpeningEdit(id, pt, mode)
      }}
      onGraphHover={(pt, shiftKey) => {
        if (!pt || !wallChainFrom) {
          wallChainHover = pt
          return
        }
        wallChainHover =
          shiftKey && wallChainFrom ? orthoPoint(wallChainFrom, pt) : pt
      }}
      onVertexDragStart={() => {
        graphPreviewGraph = project.wallGraph ?? null
      }}
      onVertexDrag={(vertexId, pt) => {
        if (!project.wallGraph) return
        graphPreviewGraph = previewGraphVertexMove(
          project.wallGraph,
          vertexId,
          pt.x,
          pt.y,
        )
      }}
      onVertexDrop={(vertexId, pt) => {
        graphPreviewGraph = null
        commitGraphVertexMove(vertexId, pt.x, pt.y)
      }}
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
    {#if showGraphOpeningSelectionBar}
      <PlanGraphOpeningSelectionBar
        {selectedOpening}
        compact={compactPlanChrome}
        onClear={() => {
          selectedOpening = ''
        }}
      />
    {/if}
    {#if showGraphSelectionBar}
      <PlanGraphSelectionBar
        {selectedEdge}
        compact={compactPlanChrome}
        onClear={() => {
          selectedEdge = ''
        }}
        onSplit={() => {
          if (splitGraphWall(selectedEdge)) selectedEdge = ''
        }}
        onOpenDetails={() => (drawerOpen = true)}
      />
    {/if}
    <PlanLegend
      overlay
      interactive={planMode === 'browse'}
      editMode={editMode508}
      graphEditMode={graphEditMode}
    />

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
          {#if graphEditMode}
            <section class="graph-aside" aria-label="墙图编辑">
              <p class="graph-aside-lead">
                顶点 {project.wallGraph?.vertices.length ?? 0} · 墙段
                {project.wallGraph?.edges.length ?? 0}
              </p>
              {#if wallChainFrom}
                <button type="button" class="graph-aside-btn" onclick={clearGraphChain}>
                  清除建墙链点
                </button>
              {/if}
              {#if selectedEdge}
                <button
                  type="button"
                  class="graph-aside-btn"
                  onclick={() => {
                    if (splitGraphWall(selectedEdge)) selectedEdge = ''
                  }}>分割选中墙段</button
                >
              {/if}
            </section>
          {:else if editMode508}
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

  .plan-top-primary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .edit-chrome-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1 1 100%;
  }

  .tool-segment-scroll {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }

  .tool-segment-scroll::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 20px;
    pointer-events: none;
    background: linear-gradient(
      to left,
      color-mix(in srgb, var(--card) 96%, transparent),
      transparent
    );
    opacity: 0;
    transition: opacity 0.15s ease;
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

  .step-segment {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    gap: 2px;
  }

  .tool-segment {
    display: inline-flex;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, #1d6b42 25%, var(--border));
    background: color-mix(in srgb, #1d6b42 6%, var(--bg));
    gap: 2px;
  }

  .step-btn {
    font-size: 12px;
    font-weight: 600;
    min-height: 34px;
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    white-space: nowrap;
  }

  .step-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .step-btn.active {
    background: color-mix(in srgb, var(--accent) 14%, var(--card));
    color: var(--accent);
  }

  .plan-convert-banner {
    flex: 1 1 100%;
    margin: 0;
    padding: 8px 10px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--t2);
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  }

  .plan-convert-link {
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    font-size: inherit;
    font-weight: 650;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .graph-aside {
    padding: 14px 16px;
  }

  .graph-aside-lead {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--t2);
    font-family: var(--mono);
  }

  .graph-aside-btn {
    display: block;
    width: 100%;
    margin-top: 8px;
    font-size: 13px;
    font-weight: 600;
    min-height: 40px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    cursor: pointer;
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
      gap: 6px;
      padding: 6px 8px;
      margin-bottom: 6px;
    }

    .plan-top-edit .plan-top-primary {
      flex: 1 1 100%;
    }

    .plan-top-edit .edit-chrome-wrap {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    .plan-top-edit .step-segment {
      width: 100%;
      justify-content: space-between;
    }

    .plan-top-edit .step-segment .step-btn {
      flex: 1 1 0;
      padding-inline: 8px;
    }

    .plan-top-edit .tool-segment-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding-bottom: 2px;
    }

    .plan-top-edit .tool-segment-scroll::-webkit-scrollbar {
      display: none;
    }

    .plan-top-edit .tool-segment {
      flex-shrink: 0;
      width: max-content;
    }

    .plan-top-edit .tool-segment-scroll::after {
      opacity: 1;
    }

    .plan-top-edit .step-btn {
      min-height: 44px;
    }

    .plan-convert-banner {
      font-size: 11px;
      padding: 6px 8px;
    }

    .mode-btn {
      min-height: 44px;
      min-width: 64px;
      font-size: 13px;
      padding: 8px 14px;
    }

    .help-btn {
      width: 44px;
      height: 44px;
    }

    .mode-undo-btn {
      width: 44px;
      height: 44px;
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

    .plan-stage:has(:global(.graph-open-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }

    .plan-stage:has(:global(.graph-sel-bar)) .plan-drawer {
      bottom: calc(
        var(--bottom-nav-height, 64px) + var(--safe-bottom-effective) + 148px
      );
    }
  }
</style>
