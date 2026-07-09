<script>
  /** @type {{ label: string, desc?: string, children?: import('svelte').Snippet }} */
  let { label, desc, children } = $props()
</script>

<div class="pref-row">
  <div class="pref-copy">
    <div class="pref-label">{label}</div>
    {#if desc}
      <p class="pref-desc">{desc}</p>
    {/if}
  </div>
  <div class="pref-control">
    {@render children?.()}
  </div>
</div>
