<script>
  /** @type {{ label: string, desc?: string }} */
  let { label, desc = '', children } = $props();
</script>

<div class="settings-row set-row">
  <div class="pref-copy">
    <div class="sr-label pref-label">{label}</div>
    {#if desc}
      <div class="sr-desc pref-desc">{desc}</div>
    {/if}
  </div>
  <div class="pref-control">
    {@render children?.()}
  </div>
</div>
