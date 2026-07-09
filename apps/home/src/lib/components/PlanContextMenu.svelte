<script>
  /** @type {{
   *   open?: boolean,
   *   x?: number,
   *   y?: number,
   *   items?: { id: string, label: string, action: () => void }[],
   *   onClose?: () => void,
   * }} */
  let { open = false, x = 0, y = 0, items = [], onClose } = $props()

  const menuStyle = $derived(`left:${Math.max(8, x)}px;top:${Math.max(8, y)}px`)
</script>

{#if open && items.length}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="ctx-backdrop" onclick={() => onClose?.()} role="presentation"></div>
  <menu
    class="ctx-menu"
    style={menuStyle}
    aria-label="平面图操作"
  >
    {#each items as item (item.id)}
      <li>
        <button
          type="button"
          class="ctx-item"
          onclick={() => {
            item.action()
            onClose?.()
          }}
        >
          {item.label}
        </button>
      </li>
    {/each}
  </menu>
{/if}

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: transparent;
  }

  .ctx-menu {
    position: fixed;
    z-index: 56;
    margin: 0;
    padding: 6px;
    list-style: none;
    min-width: 168px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.35);
  }

  .ctx-item {
    display: block;
    width: 100%;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    padding: 10px 12px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--t1);
    cursor: pointer;
  }

  .ctx-item:hover,
  .ctx-item:focus-visible {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
    color: var(--accent);
    outline: none;
  }
</style>
