<script>
  /**
   * The one and only tool palette for wall-graph editing — desktop *and* mobile.
   *
   * It is deliberately the single control for `activeTool`: the page derives
   * every legacy tool flag (graphTool / zoneTool / placementTool / viewpointTool)
   * from it, so there is no second widget that can disagree about what is armed.
   *
   * Tools are grouped in workflow order (结构 → 划分 → 布置 → 记录) by hairline
   * separators; the order *is* the guidance that the old ①②③④ step segment used
   * to carry. Anything contextual to the active tool arrives via the `options`
   * snippet and renders in a strip below the rail, never in the page header —
   * the header must not grow, or the canvas resizes under the user.
   *
   * @type {{
   *   activeTool?: string | null,
   *   canUndo?: boolean,
   *   canRedo?: boolean,
   *   hidden?: boolean,
   *   onTool?: (id: 'select' | 'wall' | 'opening' | 'zone' | 'furniture' | 'storage' | 'viewpoint') => void,
   *   onUndo?: () => void,
   *   onRedo?: () => void,
   *   options?: import('svelte').Snippet,
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
    options,
  } = $props()

  /**
   * `sep` entries render as a hairline group divider. Number keys match the
   * page's 1–7 shortcuts, and are shown in the tooltip so the binding is
   * discoverable without opening the help drawer.
   */
  /** @type {HTMLElement | null} */
  let railEl = $state(null)

  // The rail scrolls horizontally on mobile and does not fit all seven tools.
  // Keeping the armed one on screen is not a nicety: a palette whose active
  // tool is scrolled out of view is a mode with no visible indicator at all.
  $effect(() => {
    if (!railEl || hidden || !activeTool) return
    const btn = railEl.querySelector('.pt-btn.active')
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  const tools = /** @type {const} */ ([
    { id: 'select', label: '选择', key: '1', hint: '选择并编辑已有对象 · Delete 删除' },
    { sep: '结构' },
    { id: 'wall', label: '建墙', key: '2', hint: '点击拐点连线建墙 · Shift 正交 · Esc 断链' },
    { id: 'opening', label: '门窗', key: '3', hint: '点击墙段放置门或窗' },
    { sep: '划分' },
    { id: 'zone', label: '画区', key: '4', hint: '逐点圈出房间分区 · Enter 闭合' },
    { sep: '布置' },
    { id: 'furniture', label: '家具', key: '5', hint: '点击画布放置家具' },
    { id: 'storage', label: '标储藏', key: '6', hint: '点击分区或家具指派 S1–S8' },
    { sep: '记录' },
    { id: 'viewpoint', label: '视角', key: '7', hint: '标注实拍照片是对着哪儿拍的' },
  ])
</script>

<div class="plan-tools" class:hidden inert={hidden}>
  <div
    bind:this={railEl}
    class="pt-rail"
    role="toolbar"
    aria-label="绘制工具"
    aria-orientation="vertical"
  >
    {#each tools as tool (tool.sep ?? tool.id)}
      {#if tool.sep}
        <div class="pt-sep" role="separator" aria-label={tool.sep}></div>
      {:else}
        <button
          type="button"
          class="pt-btn"
          class:active={activeTool === tool.id}
          aria-pressed={activeTool === tool.id}
          title={`${tool.label}（${tool.key}）— ${tool.hint}`}
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
                /><path d="M2 17h16" stroke="currentColor" stroke-width="1.8" /></svg
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
            {:else if tool.id === 'furniture'}
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
            {:else if tool.id === 'storage'}
              <svg viewBox="0 0 20 20"
                ><rect
                  x="3"
                  y="4"
                  width="14"
                  height="4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                /><path
                  d="M4.5 8v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                /><path
                  d="M8 11h4"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                /></svg
              >
            {:else}
              <svg viewBox="0 0 20 20"
                ><path
                  d="M10 15 L3.5 5.2 A 8 8 0 0 1 16.5 5.2 Z"
                  fill="currentColor"
                  fill-opacity="0.18"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linejoin="round"
                /><circle cx="10" cy="15" r="2.2" fill="currentColor" /></svg
              >
            {/if}
          </span>
          <span class="pt-label">{tool.label}</span>
        </button>
      {/if}
    {/each}

    <div class="pt-sep pt-sep-strong" aria-hidden="true"></div>

    <div class="pt-history" role="group" aria-label="编辑历史">
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
  </div>

  {#if options}
    <!-- Absolutely placed on desktop so the rail's own width never reacts to
         which tool is active — a rail that resizes moves the buttons under the
         pointer between clicks. -->
    <div class="pt-options" role="group" aria-label="工具选项">
      {@render options()}
    </div>
  {/if}
</div>

<style>
  .plan-tools {
    position: absolute;
    z-index: 44;
    left: var(--stack-tight, 10px);
    top: 50%;
    transform: translateY(-50%);
    transition: opacity 0.15s ease;
  }

  .plan-tools.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .pt-rail {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    width: max-content;
    padding: 6px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
  }

  .pt-history {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 4px;
  }

  .pt-sep {
    height: 1px;
    align-self: stretch;
    margin: 2px 4px;
    background: color-mix(in srgb, var(--border) 70%, transparent);
  }

  .pt-sep-strong {
    background: color-mix(in srgb, var(--border) 100%, transparent);
  }

  /* Beside the rail, not under it: the rail is vertically centred, so its
     bottom edge sits right where the 图例 chip lives. */
  .pt-options {
    position: absolute;
    top: 0;
    left: calc(100% + 8px);
    display: flex;
    align-items: center;
    gap: 4px;
    width: max-content;
    max-width: 62vw;
    padding: 5px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.32);
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

  /* Mobile: same palette, same tool ids, same labels — only the axis changes.
     It stays top-left because the bottom belt is already spoken for by the
     selection bars, the zoom chip and the bottom nav. */
  @media (max-width: 599px) {
    .plan-tools {
      top: var(--stack-tight, 8px);
      left: var(--stack-tight, 8px);
      /* Full width: the zoom chrome sits at the *bottom* on compact, so the
         old 104px reservation here was protecting empty space. */
      right: var(--stack-tight, 8px);
      transform: none;
    }

    .pt-rail {
      flex-direction: row;
      align-items: center;
      width: auto;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 4px;
    }

    .pt-rail::-webkit-scrollbar {
      display: none;
    }

    .pt-sep {
      width: 1px;
      height: auto;
      margin: 4px 2px;
      flex-shrink: 0;
    }

    .pt-btn {
      min-width: 46px;
      min-height: 46px;
      flex-shrink: 0;
    }

    /* 顶栏空间有限：撤销/重做由页面顶栏提供 */
    .pt-history,
    .pt-sep-strong {
      display: none;
    }

    .pt-options {
      position: static;
      margin-top: 6px;
      max-width: none;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .pt-options::-webkit-scrollbar {
      display: none;
    }
  }
</style>
