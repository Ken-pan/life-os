<script>
  /** @type {{ children }} */
  let { children } = $props()
</script>

<div class="settings-btn-group settings-actions">
  {@render children?.()}
</div>
