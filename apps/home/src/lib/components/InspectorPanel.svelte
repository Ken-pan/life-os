<script>
  // 共享 Inspector 外壳:标题 + 可选关闭按钮 + 可滚动 body。
  // 只管头部/内容排版,不管定位/背景/遮罩 —— 那部分三页差异较大(/plan 是遮罩抽屉,
  // /storage 桌面常驻/移动底部抽屉,/tidy 桌面常驻侧栏),各自外层容器自己定。
  /**
   * @type {{
   *   title: string,
   *   onClose?: () => void,
   *   closeLabel?: string,
   *   bodyPad?: string,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { title, onClose, closeLabel = '关闭面板', bodyPad = '16px', children } = $props()
</script>

<div class="inspector-panel">
  <header class="inspector-panel-head">
    <h2 class="inspector-panel-title">{title}</h2>
    {#if onClose}
      <button
        type="button"
        class="inspector-panel-close"
        onclick={onClose}
        aria-label={closeLabel}
      >
        ×
      </button>
    {/if}
  </header>
  <div class="inspector-panel-body" style="--home-inspector-pad: {bodyPad}">
    {@render children()}
  </div>
</div>

<style>
  .inspector-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .inspector-panel-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }

  .inspector-panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--t1);
  }

  .inspector-panel-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 20px;
    line-height: 1;
    color: var(--t2);
    background: none;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
  }

  .inspector-panel-close:hover {
    color: var(--t1);
    background: color-mix(in srgb, var(--bg) 75%, transparent);
  }

  .inspector-panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--home-inspector-pad, 16px);
  }
</style>
