<script>
  /** @type {{ open?: boolean, onClose?: () => void }} */
  let { open = false, onClose } = $props()
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="help-backdrop" onclick={() => onClose?.()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="help-panel"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-labelledby="plan-help-title"
      tabindex="-1"
    >
      <header class="help-head">
        <h2 id="plan-help-title" class="help-title">平面图快捷键</h2>
        <button type="button" class="help-close" onclick={() => onClose?.()} aria-label="关闭">×</button>
      </header>
      <dl class="help-list">
        <div class="help-row"><dt><kbd>?</kbd></dt><dd>打开/关闭本帮助</dd></div>
        <div class="help-row"><dt><kbd>E</kbd></dt><dd>浏览 ↔ 编辑</dd></div>
        <div class="help-row"><dt><kbd>F</kbd></dt><dd>切换全图 / 铺满宽度</dd></div>
        <div class="help-row"><dt><kbd>Esc</kbd></dt><dd>取消选中 → 退出编辑</dd></div>
        <div class="help-row"><dt><kbd>⌘Z</kbd></dt><dd>撤销修改</dd></div>
        <div class="help-row"><dt><kbd>⌘⇧Z</kbd></dt><dd>重做</dd></div>
        <div class="help-row"><dt><kbd>Delete</kbd></dt><dd>隐藏选中门窗</dd></div>
      </dl>
      <p class="help-note">
        浏览模式点击储藏区进入物品清单；编辑模式可拖曳墙与门窗。布局备份见设置页。
      </p>
    </div>
  </div>
{/if}

<style>
  .help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(12, 16, 22, 0.42);
    display: grid;
    place-items: center;
    padding: 20px;
  }

  .help-panel {
    width: min(420px, 100%);
    max-height: min(88dvh, 560px);
    overflow: auto;
    padding: 18px 20px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.35);
  }

  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .help-title {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    color: var(--t1);
  }

  .help-close {
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

  .help-list {
    margin: 0;
    display: grid;
    gap: 8px;
  }

  .help-row {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 10px;
    align-items: baseline;
    font-size: 13px;
  }

  .help-row dt {
    margin: 0;
  }

  .help-row dd {
    margin: 0;
    color: var(--t2);
    line-height: 1.45;
  }

  kbd {
    font-size: 11px;
    font-weight: 650;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t1);
    font-family: var(--mono);
  }

  .help-note {
    margin: 14px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--t3);
    line-height: 1.5;
  }
</style>
