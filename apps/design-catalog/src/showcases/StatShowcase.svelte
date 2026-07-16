<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
</script>

<section class="catalog-section" data-testid="showcase-stat">
  <h2 class="catalog-section__title">Stat / KPI (.stat)</h2>
  <p class="catalog-section__lead">
    数值瓦片原语：<code>.stat__label</code> / <code>.stat__value</code> /
    <code>.stat__delta</code>（up/down/flat）/ <code>.stat__sub</code>。
    容器交给 <code>.settings-block</code> 或 <code>.card</code>，
    栅格用既有 <code>.life-os-grid--kpi</code>。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="KPI grid">
      <div class="life-os-grid life-os-grid--kpi catalog-stat-grid">
        <div class="settings-block stat">
          <span class="stat__label">Sessions this week</span>
          <span class="stat__value">4</span>
          <span class="stat__sub">of 5 planned</span>
        </div>
        <div class="settings-block stat">
          <span class="stat__label">Total volume</span>
          <span class="stat__value">12,480</span>
          <span class="stat__sub">kg · all lifts</span>
        </div>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="delta" label="Delta (up / down / flat)">
      <div class="life-os-grid life-os-grid--kpi catalog-stat-grid">
        <div class="settings-block stat stat--compact">
          <span class="stat__label">Net worth</span>
          <span class="stat__value">¥2.4M</span>
          <span class="stat__delta stat__delta--up">▲ 3.2%</span>
        </div>
        <div class="settings-block stat stat--compact">
          <span class="stat__label">Spend vs budget</span>
          <span class="stat__value">¥86k</span>
          <span class="stat__delta stat__delta--down">▼ 12%</span>
        </div>
        <div class="settings-block stat stat--compact">
          <span class="stat__label">Resting HR</span>
          <span class="stat__value">54</span>
          <span class="stat__delta stat__delta--flat">— unchanged</span>
        </div>
      </div>
    </CatalogStateBlock>
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
  .catalog-section__lead {
    margin: 0 0 20px;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-sm);
  }
  .catalog-stat-grid {
    max-width: 560px;
  }
</style>
