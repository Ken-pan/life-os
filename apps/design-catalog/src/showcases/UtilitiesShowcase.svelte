<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
</script>

<section class="catalog-section" data-testid="showcase-utilities">
  <h2 class="catalog-section__title">Banners & utilities</h2>
  <div class="catalog-panel catalog-grid catalog-doc-preview">
    <CatalogStateBlock stateId="info" label="Info">
      <div class="banner info" role="status">Info banner</div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="positive" label="Success">
      <div class="banner positive" role="status">Success banner</div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="warn" label="Warning">
      <div class="banner warn" role="alert">Warning banner</div>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="critical" label="Critical">
      <div class="banner critical banner--row" role="alert">
        <span class="banner__text">Critical banner with action</span>
        <button type="button" class="btn-ghost banner-close">Dismiss</button>
      </div>
    </CatalogStateBlock>
  </div>
  <div class="catalog-panel" style="margin-top: 16px;">
    <p
      class="life-os-pad-inline"
      style="background: var(--card); padding-block: 12px;"
    >
      .life-os-pad-inline
    </p>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 20px;
    font-size: 22px;
  }
</style>
