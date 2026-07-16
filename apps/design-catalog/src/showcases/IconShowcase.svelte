<script>
  import Icon from '@life-os/platform-web/svelte/icon'

  const icons = [
    'check',
    'x',
    'chevron-left',
    'chevron-up',
    'chevron-down',
    'search',
    'settings',
  ]
</script>

<section class="catalog-section" data-testid="showcase-icon">
  <h2 class="catalog-section__title">Icon registry</h2>
  <div class="catalog-panel catalog-row">
    {#each icons as name}
      <div
        style="display:flex;flex-direction:column;align-items:center;gap:6px;"
      >
        <Icon {name} size={20} />
        <span class="catalog-swatch__label">{name}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 20px;
    font-size: var(--text-2xl);
  }
</style>
