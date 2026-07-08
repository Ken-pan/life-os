<script>
  /** @type {{ children }} */
  let { children } = $props()
</script>

<div class="settings-btn-group import-row settings-actions">
  {@render children?.()}
</div>
