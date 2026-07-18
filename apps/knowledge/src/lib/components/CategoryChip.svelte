<script>
  // 标签 chip：默认中性样式（降噪）；colored=true 时走稳定 hue（状态/类型场景）。
  import { tagHueVar } from '$lib/tagColor.js'
  /** @type {{ tag: string, colored?: boolean }} */
  let { tag, colored = false } = $props()
</script>

{#if colored}
  <span class="cat-chip cat-chip--hue" style="--hue: {tagHueVar(tag)}">{tag}</span>
{:else}
  <span class="cat-chip">{tag}</span>
{/if}

<style>
  .cat-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 9px;
    border-radius: var(--radius-pill, 999px);
    font-size: var(--kn-meta, var(--text-xs, 12px));
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    color: var(--t2, var(--text-secondary));
    background: color-mix(in srgb, var(--t1, var(--text)) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1, var(--text)) 8%, transparent);
  }
  .cat-chip--hue {
    color: var(--hue);
    background: color-mix(in srgb, var(--hue) 14%, transparent);
    border-color: transparent;
  }
</style>
