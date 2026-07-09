<script>
  import {
    applyLayoutConfig,
    canRedoLayout,
    canUndoLayout,
    getActiveProject,
    getLayoutDragPreview,
    redoLayoutEdit,
    undoLayoutEdit,
  } from '$lib/state.svelte.js'
  import { toast } from '$lib/ui.svelte.js'
  import { formatFtIn } from '$lib/spatial/dimensions.js'
  import { setRoomDimension, validate508Config } from '$lib/spatial/layout-508.js'
  import {
    OPENING_EDIT_BINDINGS,
    resolveWallBinding,
  } from '$lib/spatial/wall-edit.js'

  /** @type {{
   *   selectedWall?: string,
   *   selectedOpening?: string,
   *   onClear?: () => void,
   *   onOpenDetails?: () => void,
   * }} */
  let { selectedWall = '', selectedOpening = '', onClear, onOpenDetails } = $props()

  const project = $derived(getActiveProject())
  const config = $derived(project.layoutConfig)
  const previewConfig = $derived(getLayoutDragPreview())
  const activeConfig = $derived(previewConfig ?? config)
  const isPreview = $derived(previewConfig !== null)
  const undoAvailable = $derived(canUndoLayout())
  const redoAvailable = $derived(canRedoLayout())

  const wallBinding = $derived(
    selectedWall ? resolveWallBinding(selectedWall) : null,
  )
  const openingBinding = $derived(
    selectedOpening ? OPENING_EDIT_BINDINGS[selectedOpening] : null,
  )

  const title = $derived(
    wallBinding
      ? `墙体 · ${wallBinding.label}`
      : openingBinding
        ? `开口 · ${openingBinding.label}`
        : '',
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
</script>

{#if title}
  <div class="sel-bar" role="toolbar" aria-label="选中项快捷编辑">
    <span class="sel-title">{title}</span>

    {#if wallBinding?.roomKey && wallBinding.axis && activeConfig}
      {@const room =
        activeConfig.rooms[
          /** @type {keyof typeof activeConfig.rooms} */ (wallBinding.roomKey)
        ]}
      {#if room && wallBinding.axis in room}
        <label class="sel-field">
          宽
          <span class="sel-inputs">
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
            <span>′</span>
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
            <span>″</span>
          </span>
        </label>
        <label class="sel-field">
          深
          <span class="sel-inputs">
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
            <span>′</span>
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
            <span>″</span>
          </span>
        </label>
      {:else if wallBinding.type === 'columnSplit' && activeConfig}
        <span class="sel-meta"
          >左 {formatFtIn(activeConfig.leftCol)} · 右 {formatFtIn(activeConfig.rightCol)}</span
        >
      {/if}
    {:else if openingBinding && activeConfig}
      <span class="sel-meta">拖曳移动 · Delete 仅隐藏门窗</span>
    {/if}

    <div class="sel-actions">
      <button
        type="button"
        class="sel-btn"
        disabled={!undoAvailable}
        title="撤销 (⌘Z)"
        onclick={undoLayoutEdit}
      >
        撤销
      </button>
      <button
        type="button"
        class="sel-btn"
        disabled={!redoAvailable}
        title="重做"
        onclick={redoLayoutEdit}
      >
        重做
      </button>
      <button type="button" class="sel-btn sel-btn-accent" onclick={() => onOpenDetails?.()}>
        详情
      </button>
      <button type="button" class="sel-btn" onclick={() => onClear?.()} aria-label="取消选中">
        ×
      </button>
    </div>
  </div>
{/if}

<style>
  .sel-bar {
    position: absolute;
    left: 50%;
    bottom: max(14px, var(--safe-bottom-effective));
    transform: translateX(-50%);
    z-index: 42;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    max-width: min(720px, calc(100% - 24px));
    padding: 10px 14px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
  }

  .sel-title {
    font-size: 13px;
    font-weight: 650;
    color: var(--t1);
    white-space: nowrap;
  }

  .sel-meta {
    font-size: 12px;
    color: var(--t3);
    font-family: var(--mono);
  }

  .sel-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--t2);
  }

  .sel-inputs {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .sel-inputs input {
    width: 36px;
    font-size: 12px;
    font-family: var(--mono);
    padding: 4px 5px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
  }

  .sel-inputs span {
    font-size: 10px;
    color: var(--t3);
  }

  .sel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .sel-btn {
    font-size: 12px;
    font-weight: 600;
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .sel-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .sel-btn-accent {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  @media (max-width: 599px) {
    .sel-bar {
      display: none;
    }
  }
</style>
