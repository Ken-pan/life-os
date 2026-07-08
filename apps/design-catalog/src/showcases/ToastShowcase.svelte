<script>
  import Toast from '@life-os/platform-web/svelte/toast'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'
</script>

<section class="catalog-section" data-testid="showcase-toast">
  <h2 class="catalog-section__title">Toast component</h2>
  <div class="catalog-panel catalog-grid catalog-doc-preview">
    <CatalogStateBlock stateId="success" label="Success + action">
      <Toast
        state={{
          show: true,
          msg: 'Track added',
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => {},
        }}
        dismissLabel="Dismiss"
        onDismiss={() => {}}
      />
    </CatalogStateBlock>
    <CatalogStateBlock stateId="info" label="Info">
      <Toast
        state={{ show: true, msg: 'Saved', tone: 'info' }}
        dismissLabel="Close"
        onDismiss={() => {}}
      />
    </CatalogStateBlock>
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
