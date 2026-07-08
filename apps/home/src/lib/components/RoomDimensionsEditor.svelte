<script>
  import {
    canRedoLayout,
    canUndoLayout,
    getActiveProject,
    redoLayoutEdit,
    reset508Layout,
    undoLayoutEdit,
    updateRoomDimension,
  } from '$lib/state.svelte.js'
  import { EDITABLE_ROOM_KEYS, validate508Config } from '$lib/spatial/layout-508.js'
  import { formatFtIn } from '$lib/spatial/dimensions.js'

  const project = $derived(getActiveProject())
  const config = $derived(project.layoutConfig)
  const validationIssues = $derived(config ? validate508Config(config) : [])
  const undoAvailable = $derived(canUndoLayout())
  const redoAvailable = $derived(canRedoLayout())

  let saveFlash = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let flashTimer
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let debounceTimer

  /** @param {string} roomKey @param {'w' | 'h'} axis @param {'ft' | 'in'} field @param {string} raw */
  function onDimInput(roomKey, axis, field, raw) {
    if (!config) return
    const room = /** @type {Record<string, { w: { ft: number, in?: number }, h: { ft: number, in?: number } }>} */ (
      config.rooms
    )[roomKey]
    if (!room) return
    const n = Math.max(0, parseInt(raw, 10) || 0)
    const current = room[axis]
    const next =
      field === 'ft' ? { ft: n, in: current.in ?? 0 } : { ft: current.ft, in: Math.min(11, n) }
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const issues = updateRoomDimension(roomKey, axis, next, { silent: true })
      if (!issues.length) {
        saveFlash = true
        clearTimeout(flashTimer)
        flashTimer = setTimeout(() => {
          saveFlash = false
        }, 1800)
      }
    }, 420)
  }
</script>

{#if config}
  <section class="dim-editor" aria-label="房间尺寸编辑">
    <header class="dim-editor-head">
      <div class="dim-editor-title-row">
        <h2 class="dim-editor-title">房间尺寸</h2>
        <div class="dim-editor-actions">
          {#if saveFlash}
            <span class="dim-saved" role="status" aria-live="polite">已保存</span>
          {/if}
          <button
            type="button"
            class="dim-undo"
            disabled={!undoAvailable}
            onclick={undoLayoutEdit}
          >
            撤销
          </button>
          <button
            type="button"
            class="dim-undo"
            disabled={!redoAvailable}
            onclick={redoLayoutEdit}
          >
            重做
          </button>
          <button type="button" class="dim-reset" onclick={reset508Layout}>恢复默认</button>
        </div>
      </div>
      <p class="dim-editor-hint">
        输入后约 0.4s 自动保存；平面、墙、门、家具与储藏区随之重算。壁橱双折门仅向卧室开启。
      </p>
      {#if validationIssues.length}
        <p class="dim-warn" role="status">{validationIssues[0]}</p>
      {/if}
    </header>

    <div class="dim-grid">
      {#each EDITABLE_ROOM_KEYS as [key, label] (key)}
        {@const room = config.rooms[/** @type {keyof typeof config.rooms} */ (key)]}
        {#if room && 'w' in room && 'h' in room}
          <div class="dim-card">
            <div class="dim-card-head">
              <span class="dim-card-name">{label}</span>
              <span class="dim-card-val">{formatFtIn(room.w)} × {formatFtIn(room.h)}</span>
            </div>
            <div class="dim-fields">
              <label class="dim-field">
                <span>宽</span>
                <span class="dim-inputs">
                  <input
                    type="number"
                    min="0"
                    max="30"
                    aria-label="{label} 宽度 英尺"
                    value={room.w.ft}
                    oninput={(e) =>
                      onDimInput(key, 'w', 'ft', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                  />
                  <span class="dim-unit">ft</span>
                  <input
                    type="number"
                    min="0"
                    max="11"
                    aria-label="{label} 宽度 英寸"
                    value={room.w.in ?? 0}
                    oninput={(e) =>
                      onDimInput(key, 'w', 'in', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                  />
                  <span class="dim-unit">in</span>
                </span>
              </label>
              <label class="dim-field">
                <span>深</span>
                <span class="dim-inputs">
                  <input
                    type="number"
                    min="0"
                    max="30"
                    aria-label="{label} 深度 英尺"
                    value={room.h.ft}
                    oninput={(e) =>
                      onDimInput(key, 'h', 'ft', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                  />
                  <span class="dim-unit">ft</span>
                  <input
                    type="number"
                    min="0"
                    max="11"
                    aria-label="{label} 深度 英寸"
                    value={room.h.in ?? 0}
                    oninput={(e) =>
                      onDimInput(key, 'h', 'in', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                  />
                  <span class="dim-unit">in</span>
                </span>
              </label>
            </div>
            {#if key === 'bedCloset'}
              <p class="dim-note">双折门宽 {formatFtIn(room.door.w)} · 开启方向：卧室</p>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<style>
  .dim-editor {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    background: var(--card);
  }

  .dim-editor-head {
    margin-bottom: 14px;
  }

  .dim-editor-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }

  .dim-editor-title {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    color: var(--t1);
  }

  .dim-editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dim-saved {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    padding: 4px 8px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    animation: dim-saved-fade 1.8s ease-out forwards;
  }

  @keyframes dim-saved-fade {
    0%,
    35% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .dim-undo,
  .dim-reset {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent);
    cursor: pointer;
  }

  .dim-undo:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    color: var(--t3);
  }

  .dim-editor-hint {
    margin: 0;
    font-size: 13px;
    color: var(--t2);
    line-height: 1.45;
  }

  .dim-warn {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--warn, #b45309);
  }

  .dim-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .dim-card {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .dim-card-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
  }

  .dim-card-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
  }

  .dim-card-val {
    font-size: 11px;
    font-family: var(--mono, monospace);
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }

  .dim-fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dim-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--t2);
  }

  .dim-inputs {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dim-inputs input {
    width: 42px;
    padding: 4px 6px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--t1);
    text-align: right;
  }

  .dim-unit {
    font-size: 11px;
    color: var(--t3);
    min-width: 14px;
  }

  .dim-note {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--t3);
    line-height: 1.4;
  }
</style>
