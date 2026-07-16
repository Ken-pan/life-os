<script>
  import { LifeOsTabs, LifeOsTabPanel } from '@life-os/platform-web/svelte/tabs'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'History' },
    { id: 'settings', label: 'Settings' },
  ]
  let active = $state('overview')

  const manyItems = [
    'Today',
    'This week',
    'This month',
    'Quarter',
    'Year to date',
    'All time',
    'Custom range',
  ].map((label, i) => ({ id: `t${i}`, label }))
  let manyActive = $state('t0')
</script>

<section class="catalog-section" data-testid="showcase-tabs">
  <h2 class="catalog-section__title">Tabs</h2>
  <p class="catalog-section__lead">
    下划线页签，来自 <code>@life-os/platform-web/svelte/tabs</code>：
    <code>LifeOsTabs</code> + <code>LifeOsTabPanel</code>（roving tabindex、
    方向键/Home/End，finance HorizontalTabs 下沉）。外观走 theme 的
    <code>.tabs</code> / <code>.tab</code>。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Default">
      <LifeOsTabs {items} activeId={active} onChange={(id) => (active = id)} ariaLabel="Demo tabs">
        {#each items as item (item.id)}
          <LifeOsTabPanel tabId={item.id} active={active === item.id} class="catalog-tab-panel">
            <p class="catalog-tab-panel__body">{item.label} panel content.</p>
          </LifeOsTabPanel>
        {/each}
      </LifeOsTabs>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="overflow" label="Overflow (scroll + fade)">
      <div class="catalog-tabs-narrow">
        <LifeOsTabs
          items={manyItems}
          activeId={manyActive}
          onChange={(id) => (manyActive = id)}
          ariaLabel="Overflow tabs"
        />
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
  :global(.catalog-tab-panel) {
    padding-top: 12px;
  }
  .catalog-tab-panel__body {
    margin: 0;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-md);
  }
  .catalog-tabs-narrow {
    max-width: 320px;
  }
</style>
