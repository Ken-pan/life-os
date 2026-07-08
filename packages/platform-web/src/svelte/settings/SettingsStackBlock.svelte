<script>
  /** @type {{ label?: string, desc?: string, children }} */
  let { label = '', desc = '', children } = $props()
</script>

<div class="settings-row set-row settings-stack-block">
  {#if label}
    <div class="sr-label pref-label">{label}</div>
  {/if}
  {#if desc}
    <div class="sr-desc pref-desc">{desc}</div>
  {/if}
  {@render children?.()}
</div>
