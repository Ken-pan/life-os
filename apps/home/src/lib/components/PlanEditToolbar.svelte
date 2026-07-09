<script>
  /**
   * Figma-style floating tool palette for desktop wall-graph edit.
   * Hidden on browse / 508 / compact-mobile (those use top-bar chrome).
   * Vertical on the left edge (desktop); history group also CSS-hidden on compact.
   *
   * @type {{
   *   activeTool?: string | null,
   *   canUndo?: boolean,
   *   canRedo?: boolean,
   *   hidden?: boolean,
   *   onTool?: (id: 'select' | 'wall' | 'opening' | 'zone' | 'furniture') => void,
   *   onUndo?: () => void,
   *   onRedo?: () => void,
   *   onReset?: () => void,
   * }}
   */
  let {
    activeTool = null,
    canUndo = false,
    canRedo = false,
    hidden = false,
    onTool,
    onUndo,
    onRedo,
    onReset,
  } = $props()

  const tools = /** @type {const} */ ([
    { id: 'select', label: '选择', hint: '选择墙段/门窗/分区，拖曳微调' },
    { id: 'wall', label: '建墙', hint: '点击拐点连线建墙 · Esc 断链' },
    { id: 'opening', label: '门窗', hint: '点击墙段放置门窗' },
    { id: 'zone', label: '画区', hint: '逐点圈出房间分区 · Enter 闭合' },
    { id: 'furniture', label: '家具', hint: '点击画布放置家具' },
  ])
</script>

<div
  class="plan-fig-toolbar"
  class:hidden
  role="toolbar"
  aria-label="绘制工具"
  aria-orientation="vertical"
  inert={hidden}
>
  <div class="pt-group" role="group" aria-label="绘制">
    {#each tools as tool (tool.id)}
      <button
        type="button"
        class="pt-btn"
        class:active={activeTool === tool.id}
        aria-pressed={activeTool === tool.id}
        title={tool.hint}
        onclick={() => onTool?.(tool.id)}
      >
        <span class="pt-icon" aria-hidden="true">
          {#if tool.id === 'select'}
            <svg viewBox="0 0 20 20"
              ><path
                d="M5 3l10 8.5-4.6.6 2.4 4.4-2 1-2.3-4.5L5 16.4Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              /></svg
            >
          {:else if tool.id === 'wall'}
            <svg viewBox="0 0 20 20"
              ><path
                d="M4 16 L4 5 L16 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              /><rect x="2" y="14" width="4" height="4" fill="currentColor" /><rect
                x="2"
                y="3"
                width="4"
                height="4"
                fill="currentColor"
              /><rect x="14" y="3" width="4" height="4" fill="currentColor" /></svg
            >
          {:else if tool.id === 'opening'}
            <svg viewBox="0 0 20 20"
              ><path
                d="M5 17V4h1"
                stroke="currentColor"
                stroke-width="1.6"
                fill="none"
              /><path
                d="M6 17A11 11 0 0 0 15 8"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-dasharray="2.4 2"
              /><path
                d="M2 17h16"
                stroke="currentColor"
                stroke-width="1.8"
              /></svg
            >
          {:else if tool.id === 'zone'}
            <svg viewBox="0 0 20 20"
              ><path
                d="M4 4h12v12H4Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-dasharray="3 2.2"
              /><circle cx="4" cy="4" r="1.8" fill="currentColor" /><circle
                cx="16"
                cy="16"
                r="1.8"
                fill="currentColor"
              /></svg
            >
          {:else}
            <svg viewBox="0 0 20 20"
              ><path
                d="M4 15v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              /><path
                d="M6 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              /><path d="M4 15h12" stroke="currentColor" stroke-width="1.8" /></svg
            >
          {/if}
        </span>
        <span class="pt-label">{tool.label}</span>
      </button>
    {/each}
  </div>

  <div class="pt-sep" aria-hidden="true"></div>

  <div class="pt-group pt-history" role="group" aria-label="编辑历史">
    <button
      type="button"
      class="pt-btn pt-btn-slim"
      disabled={!canUndo}
      title="撤销 (⌘Z)"
      aria-label="撤销"
      onclick={() => onUndo?.()}
    >
      <span class="pt-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20"
          ><path
            d="M8 4 4 8l4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          /><path
            d="M4 8h8a4 4 0 0 1 0 8h-2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          /></svg
        >
      </span>
    </button>
    <button
      type="button"
      class="pt-btn pt-btn-slim"
      disabled={!canRedo}
      title="重做 (⇧⌘Z)"
      aria-label="重做"
      onclick={() => onRedo?.()}
    >
      <span class="pt-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20"
          ><path
            d="m12 4 4 4-4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          /><path
            d="M16 8H8a4 4 0 0 0 0 8h2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          /></svg
        >
      </span>
    </button>
  </div>

  <div class="pt-sep" aria-hidden="true"></div>

  <button
    type="button"
    class="pt-btn pt-btn-warn"
    title="删除所有内墙与分区，仅保留最外围墙"
    onclick={() => onReset?.()}
  >
    <span class="pt-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20"
        ><path
          d="M4 6h12M8 6V4h4v2m-7 0 1 10h8l1-10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
    </span>
    <span class="pt-label">清空</span>
  </button>
</div>

<style>
  .plan-fig-toolbar {
    position: absolute;
    z-index: 44;
    left: var(--stack-tight, 10px);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 6px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
    transition: opacity 0.15s ease;
  }

  .plan-fig-toolbar.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .pt-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pt-history {
    flex-direction: row;
    justify-content: center;
  }

  .pt-sep {
    height: 1px;
    align-self: stretch;
    background: color-mix(in srgb, var(--border) 80%, transparent);
  }

  .pt-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 48px;
    min-height: 48px;
    padding: 5px 6px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .pt-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--t1);
  }

  .pt-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .pt-btn.active {
    background: var(--accent);
    border-color: transparent;
    color: #f5f8fa;
  }

  .pt-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .pt-btn-slim {
    min-width: 40px;
    min-height: 40px;
    flex: 1 1 0;
  }

  .pt-btn-warn {
    color: #b45309;
  }

  .pt-btn-warn:not(:disabled):hover {
    background: color-mix(in srgb, #b45309 10%, transparent);
    color: #b45309;
  }

  .pt-icon {
    display: inline-flex;
    width: 20px;
    height: 20px;
  }

  .pt-icon svg {
    width: 100%;
    height: 100%;
  }

  .pt-label {
    font-size: 10px;
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  @media (max-width: 599px) {
    .plan-fig-toolbar {
      top: var(--stack-tight, 8px);
      left: var(--stack-tight, 8px);
      right: auto;
      bottom: auto;
      transform: none;
      flex-direction: row;
      align-items: center;
      /* 右侧留给缩放控件 */
      max-width: calc(100% - 104px);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 4px;
      gap: 4px;
    }

    .plan-fig-toolbar::-webkit-scrollbar {
      display: none;
    }

    .pt-group {
      flex-direction: row;
      flex-shrink: 0;
    }

    .pt-sep {
      width: 1px;
      height: auto;
      align-self: stretch;
    }

    .pt-btn {
      min-width: 46px;
      min-height: 46px;
      flex-shrink: 0;
    }

    /* 顶部工具条空间有限：撤销/重做已在页面顶栏提供 */
    .pt-history,
    .pt-history + .pt-sep {
      display: none;
    }
  }
</style>
