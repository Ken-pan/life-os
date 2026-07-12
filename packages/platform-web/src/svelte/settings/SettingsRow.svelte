<script>
  /** @type {{ label: string, desc?: string, rowClass?: string }} */
  let { label, desc = '', rowClass = '', children } = $props()
</script>

<div class="settings-row set-row {rowClass}">
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
