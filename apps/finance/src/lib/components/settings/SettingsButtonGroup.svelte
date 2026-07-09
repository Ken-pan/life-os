<script>
  /** @type {{ children?: import('svelte').Snippet }} */
  let { children } = $props()
</script>

<div class="settings-btn-group">
  {@render children?.()}
</div>
