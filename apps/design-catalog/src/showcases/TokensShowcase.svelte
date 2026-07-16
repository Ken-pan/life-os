<script>
  const swatches = [
    { label: 'bg', var: '--bg' },
    { label: 'card', var: '--card' },
    { label: 'accent', var: '--accent' },
    { label: 't1 / text', var: '--t1' },
    { label: 'border', var: '--border' },
    { label: 'sidebar', var: '--sidebar' },
  ]
</script>

<section class="catalog-section" data-testid="showcase-tokens">
  <h2 class="catalog-section__title">Brand tokens</h2>
  <p class="catalog-section__desc">
    来自 <code>@life-os/theme/app-themes.css</code>（由 <code>@life-os/design-tokens</code> 生成）
  </p>
  <div class="catalog-panel catalog-row">
    {#each swatches as swatch}
      <div class="catalog-swatch">
        <div
          class="catalog-swatch__chip"
          style="background: var({swatch.var});"
        ></div>
        <span class="catalog-swatch__label">{swatch.label}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 8px;
    font-size: var(--text-2xl);
  }
  .catalog-section__desc {
    margin: 0 0 20px;
    color: var(--t3, var(--text-muted));
    font-size: var(--text-base);
  }
</style>
