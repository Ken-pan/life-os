<script>
  import {
    applyLayoutConfig,
    canRedoLayout,
    canUndoLayout,
    getActiveProject,
    getLayoutDragPreview,
    getLayoutSavedAt,
    isOpeningDisabled,
    redoLayoutEdit,
    setOpeningDisabled,
    undoLayoutEdit,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { formatFtIn } from '$lib/spatial/dimensions.js'
  import {
    setRoomDimension,
    validate508Config,
  } from '$lib/spatial/layout-508.js'
  import {
    OPENING_EDIT_BINDINGS,
    resolveWallBinding,
    defaultOpenings,
  } from '$lib/spatial/wall-edit.js'
  import { roomAreaSqft } from '$lib/spatial/room-areas.js'

  /** @type {{
   *   selectedWall?: string,
   *   selectedOpening?: string,
   *   onClear?: () => void,
   * }} */
  let { selectedWall = '', selectedOpening = '', onClear } = $props()

  const project = $derived(getActiveProject())
  const config = $derived(project.layoutConfig)
  const previewConfig = $derived(getLayoutDragPreview())
  const activeConfig = $derived(previewConfig ?? config)
  const isPreview = $derived(previewConfig !== null)
  const undoAvailable = $derived(canUndoLayout())
  const redoAvailable = $derived(canRedoLayout())
  const layoutSavedAt = $derived(getLayoutSavedAt())
  const disabledOpenings = $derived(config?.disabledOpenings ?? [])

  let saveFlash = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveFlashTimer

  $effect(() => {
    if (!layoutSavedAt) return
    saveFlash = true
    clearTimeout(saveFlashTimer)
    saveFlashTimer = setTimeout(() => {
      saveFlash = false
    }, 1600)
  })

  /** @param {import('$lib/spatial/types.js').Layout508Config} cfg */
  function cloneLayoutConfig(cfg) {
    return JSON.parse(JSON.stringify(cfg))
  }

  const wallBinding = $derived(
    selectedWall ? resolveWallBinding(selectedWall) : null,
  )
  const openingBinding = $derived(
    selectedOpening ? OPENING_EDIT_BINDINGS[selectedOpening] : null,
  )

  function pushConfig(next) {
    const issues = validate508Config(next)
    if (issues.length) {
      toast(issues[0], 'warn')
      return
    }
    applyLayoutConfig(next, { toastMsg: '已更新' })
  }

  /** @param {string} roomKey @param {'w'|'h'} axis @param {'ft'|'in'} field @param {string} raw */
  function patchRoom(roomKey, axis, field, raw) {
    if (!config) return
    const room =
      /** @type {Record<string, { w: import('$lib/spatial/dimensions.js').FtIn, h: import('$lib/spatial/dimensions.js').FtIn }>} */ (
        config.rooms
      )[roomKey]
    if (!room) return
    const n = Math.max(0, parseInt(raw, 10) || 0)
    const current = room[axis]
    const value =
      field === 'ft'
        ? { ft: n, in: current.in ?? 0 }
        : { ft: current.ft, in: Math.min(11, n) }
    const next = setRoomDimension(config, roomKey, axis, value)
    pushConfig(next)
  }

  /** @param {string} key @param {'offset'|'span'|'offsetFromRight'|'insetLeft'|'insetRight'} field @param {'ft'|'in'} unit @param {string} raw */
  function patchOpening(key, field, unit, raw) {
    if (!config) return
    const n = Math.max(0, parseInt(raw, 10) || 0)
    const next = cloneLayoutConfig(config)
    const openings = { ...defaultOpenings(), ...next.openings }
    const slot = openings[/** @type {keyof typeof openings} */ (key)]
    if (!slot) return
    const cur = slot[field] ?? { ft: 0, in: 0 }
    slot[field] =
      unit === 'ft'
        ? { ft: n, in: cur.in ?? 0 }
        : { ft: cur.ft, in: Math.min(11, n) }
    next.openings = openings
    pushConfig(next)
  }

  /** @param {'ft'|'in'} unit @param {string} raw */
  function patchBedClosetDoor(field, unit, raw) {
    if (!config) return
    const n = Math.max(0, parseInt(raw, 10) || 0)
    const next = cloneLayoutConfig(config)
    const cur = next.rooms.bedCloset.door[field]
    next.rooms.bedCloset.door[field] =
      unit === 'ft'
        ? { ft: n, in: cur.in ?? 0 }
        : { ft: cur.ft, in: Math.min(11, n) }
    pushConfig(next)
  }
</script>

<section class="inspector" aria-label="编辑检查器">
  <header class="inspector-head">
    <div class="inspector-head-left">
      <h2 class="inspector-title">编辑检查器</h2>
      {#if isPreview}
        <span class="insp-preview-badge" aria-live="polite">预览中</span>
      {:else if saveFlash}
        <span class="insp-saved-badge" role="status" aria-live="polite">已保存</span>
      {/if}
    </div>
    <div class="inspector-actions">
      <button
        type="button"
        class="insp-btn"
        disabled={!undoAvailable}
        onclick={undoLayoutEdit}
      >
        撤销
      </button>
      <button
        type="button"
        class="insp-btn"
        disabled={!redoAvailable}
        onclick={redoLayoutEdit}
      >
        重做
      </button>
      {#if selectedWall || selectedOpening}
        <button type="button" class="insp-btn" onclick={() => onClear?.()}
          >取消选中</button
        >
      {/if}
    </div>
  </header>

  {#if !selectedWall && !selectedOpening}
    <p class="inspector-lead">
      点击或拖拽<strong>内墙线</strong>调整房间尺寸；点击<strong
        >门窗符号</strong
      >后可微调偏移与宽度。 壁橱推拉门<strong>右侧握把</strong
      >（虚线框）可横向拖改门宽。 外墙与整体外廓随列宽联动。
    </p>
    <ul class="inspector-list">
      <li>左右列分隔墙 → 调整左/右列总宽</li>
      <li>卧室下墙、阳台下墙 → 房间深度</li>
      <li>壁橱/浴室/洗衣间竖墙 → 房间宽度</li>
      <li>客厅·厨房横墙 → 客厅高度</li>
      <li><kbd>Delete</kbd> 隐藏选中门窗（不会拆除墙体）</li>
    </ul>
    {#if disabledOpenings.length}
      <div class="inspector-hidden">
        <h3 class="inspector-label">已隐藏门窗</h3>
        <ul class="hidden-list">
          {#each disabledOpenings as id (id)}
            {@const label = OPENING_EDIT_BINDINGS[id]?.label ?? id}
            <li>
              <span>{label}</span>
              <button
                type="button"
                class="insp-btn"
                onclick={() => setOpeningDisabled(id, false)}
              >恢复</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else if wallBinding}
    <div class="inspector-card">
      <h3 class="inspector-label">墙体 · {wallBinding.label}</h3>
      {#if wallBinding.type === 'columnSplit' && activeConfig}
        <p class="inspector-meta">拖左右调整列宽分配</p>
        <div class="insp-row">
          <span>左列宽</span>
          <span class="insp-val">{formatFtIn(activeConfig.leftCol)}</span>
        </div>
        <div class="insp-row">
          <span>右列宽</span>
          <span class="insp-val">{formatFtIn(activeConfig.rightCol)}</span>
        </div>
      {:else if wallBinding.roomKey && wallBinding.axis && activeConfig}
        {@const room =
          activeConfig.rooms[
            /** @type {keyof typeof activeConfig.rooms} */ (wallBinding.roomKey)
          ]}
        {#if room && wallBinding.axis in room}
          <p class="inspector-meta">
            {isPreview ? '拖拽预览（松手后写入）' : '关联房间尺寸'}
            · 面积约 {roomAreaSqft(room.w, room.h)} sqft
          </p>
          <label class="insp-field">
            宽
            <span class="insp-inputs">
              <input
                type="number"
                disabled={isPreview}
                value={room.w.ft}
                onchange={(e) =>
                  patchRoom(
                    wallBinding.roomKey,
                    'w',
                    'ft',
                    /** @type {HTMLInputElement} */ (e.currentTarget).value,
                  )}
              />
              <span>ft</span>
              <input
                type="number"
                disabled={isPreview}
                value={room.w.in ?? 0}
                onchange={(e) =>
                  patchRoom(
                    wallBinding.roomKey,
                    'w',
                    'in',
                    /** @type {HTMLInputElement} */ (e.currentTarget).value,
                  )}
              />
              <span>in</span>
            </span>
          </label>
          <label class="insp-field">
            深
            <span class="insp-inputs">
              <input
                type="number"
                disabled={isPreview}
                value={room.h.ft}
                onchange={(e) =>
                  patchRoom(
                    wallBinding.roomKey,
                    'h',
                    'ft',
                    /** @type {HTMLInputElement} */ (e.currentTarget).value,
                  )}
              />
              <span>ft</span>
              <input
                type="number"
                disabled={isPreview}
                value={room.h.in ?? 0}
                onchange={(e) =>
                  patchRoom(
                    wallBinding.roomKey,
                    'h',
                    'in',
                    /** @type {HTMLInputElement} */ (e.currentTarget).value,
                  )}
              />
              <span>in</span>
            </span>
          </label>
        {/if}
      {/if}
    </div>
  {:else if openingBinding && activeConfig}
    <div class="inspector-card">
      <h3 class="inspector-label">开口 · {openingBinding.label}</h3>
      {#if openingBinding.configPath === 'bedCloset.door'}
        <label class="insp-field">
          门偏移
          <span class="insp-inputs">
            <input
              type="number"
              disabled={isPreview}
              value={activeConfig.rooms.bedCloset.door.offset.ft}
              onchange={(e) =>
                patchBedClosetDoor(
                  'offset',
                  'ft',
                  /** @type {HTMLInputElement} */ (e.currentTarget).value,
                )}
            />
            <span>ft</span>
            <input
              type="number"
              disabled={isPreview}
              value={activeConfig.rooms.bedCloset.door.offset.in ?? 0}
              onchange={(e) =>
                patchBedClosetDoor(
                  'offset',
                  'in',
                  /** @type {HTMLInputElement} */ (e.currentTarget).value,
                )}
            />
            <span>in</span>
          </span>
        </label>
        <label class="insp-field">
          门宽
          <span class="insp-inputs">
            <input
              type="number"
              disabled={isPreview}
              value={activeConfig.rooms.bedCloset.door.w.ft}
              onchange={(e) =>
                patchBedClosetDoor(
                  'w',
                  'ft',
                  /** @type {HTMLInputElement} */ (e.currentTarget).value,
                )}
            />
            <span>ft</span>
            <input
              type="number"
              disabled={isPreview}
              value={activeConfig.rooms.bedCloset.door.w.in ?? 0}
              onchange={(e) =>
                patchBedClosetDoor(
                  'w',
                  'in',
                  /** @type {HTMLInputElement} */ (e.currentTarget).value,
                )}
            />
            <span>in</span>
          </span>
        </label>
        <p class="inspector-meta">或在平面图上拖右侧握把调整门宽</p>
      {:else if openingBinding.configPath}
        {@const op = { ...defaultOpenings(), ...activeConfig.openings }[
          /** @type {keyof ReturnType<typeof defaultOpenings>} */ (
            openingBinding.configPath
          )
        ]}
        {#if op}
          {#if openingBinding.drag === 'offset' || openingBinding.drag === 'offsetFromRight'}
            {@const field = openingBinding.drag}
            {@const val = op[field] ?? { ft: 0, in: 0 }}
            <label class="insp-field">
              {field === 'offsetFromRight' ? '距右缘' : '沿墙偏移'}
              <span class="insp-inputs">
                <input
                  type="number"
                  disabled={isPreview}
                  value={val.ft}
                  onchange={(e) =>
                    patchOpening(
                      openingBinding.configPath,
                      field,
                      'ft',
                      /** @type {HTMLInputElement} */ (e.currentTarget).value,
                    )}
                />
                <span>ft</span>
                <input
                  type="number"
                  disabled={isPreview}
                  value={val.in ?? 0}
                  onchange={(e) =>
                    patchOpening(
                      openingBinding.configPath,
                      field,
                      'in',
                      /** @type {HTMLInputElement} */ (e.currentTarget).value,
                    )}
                />
                <span>in</span>
              </span>
            </label>
          {/if}
          {#if op.span}
            <label class="insp-field">
              开口宽度
              <span class="insp-inputs">
                <input
                  type="number"
                  disabled={isPreview}
                  value={op.span.ft}
                  onchange={(e) =>
                    patchOpening(
                      openingBinding.configPath,
                      'span',
                      'ft',
                      /** @type {HTMLInputElement} */ (e.currentTarget).value,
                    )}
                />
                <span>ft</span>
                <input
                  type="number"
                  disabled={isPreview}
                  value={op.span.in ?? 0}
                  onchange={(e) =>
                    patchOpening(
                      openingBinding.configPath,
                      'span',
                      'in',
                      /** @type {HTMLInputElement} */ (e.currentTarget).value,
                    )}
                />
                <span>in</span>
              </span>
            </label>
          {/if}
          {#if openingBinding.drag === 'insetLeft' || openingBinding.drag === 'insetRight'}
            {@const field = openingBinding.drag}
            {@const val = op[field] ?? { ft: 0, in: 0 }}
            <label class="insp-field">
              {field === 'insetLeft' ? '左内缩' : '右内缩'}
              <span class="insp-inputs">
                <input
                  type="number"
                  disabled={isPreview}
                  value={val.ft}
                  onchange={(e) =>
                    patchOpening(
                      openingBinding.configPath,
                      field,
                      'ft',
                      /** @type {HTMLInputElement} */ (e.currentTarget).value,
                    )}
                />
                <span>ft</span>
                <input
                  type="number"
                  disabled={isPreview}
                  value={val.in ?? 0}
                  onchange={(e) =>
                    patchOpening(
                      openingBinding.configPath,
                      field,
                      'in',
                      /** @type {HTMLInputElement} */ (e.currentTarget).value,
                    )}
                />
                <span>in</span>
              </span>
            </label>
          {/if}
        {/if}
      {/if}
      {#if selectedOpening && !isOpeningDisabled(selectedOpening)}
        <button
          type="button"
          class="insp-btn insp-btn-warn"
          disabled={isPreview}
          onclick={() => {
            setOpeningDisabled(selectedOpening, true)
            onClear?.()
          }}
        >
          隐藏此门窗
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .inspector {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    background: var(--card);
  }

  .inspector-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .inspector-head-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .insp-preview-badge {
    font-size: 11px;
    font-weight: 650;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(92, 117, 140, 0.14);
    color: var(--accent);
    white-space: nowrap;
  }

  .insp-saved-badge {
    font-size: 11px;
    font-weight: 650;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(34, 139, 84, 0.12);
    color: var(--graph-accent);
    white-space: nowrap;
  }

  .inspector-title {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    color: var(--t1);
  }

  .inspector-actions {
    display: flex;
    gap: 8px;
  }

  .insp-btn {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent);
    cursor: pointer;
  }

  .insp-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    color: var(--t3);
  }

  .insp-btn-warn {
    margin-top: 10px;
    color: #b45309;
    border-color: color-mix(in srgb, #b45309 35%, var(--border));
  }

  .inspector-hidden {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .hidden-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }

  .hidden-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--t2);
  }

  .inspector-list kbd {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-family: var(--mono);
  }

  .inspector-lead {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.5;
  }

  .inspector-list {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--t3);
    line-height: 1.55;
  }

  .inspector-card {
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .inspector-label {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--t1);
  }

  .inspector-meta {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--t3);
  }

  .insp-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--t2);
    margin-bottom: 6px;
  }

  .insp-val {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--t1);
  }

  .insp-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--t2);
    margin-bottom: 8px;
  }

  .insp-inputs {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .insp-inputs input {
    width: 42px;
    padding: 4px 6px;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--t1);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .insp-inputs input:disabled {
    opacity: 0.72;
    cursor: default;
    color: var(--accent);
    font-weight: 600;
  }

  .insp-inputs span {
    font-size: 11px;
    color: var(--t3);
  }
</style>
