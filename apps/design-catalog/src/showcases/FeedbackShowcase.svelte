<script>
  import SyncErrorBanner from '@life-os/platform-web/svelte/sync-error'
  import Toast from '@life-os/platform-web/svelte/toast'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  function subscribe(onError) {
    onError('network')
    return () => {}
  }

  function formatMessage(reason) {
    return `Sync failed: ${reason}`
  }
</script>

<section class="catalog-section" data-testid="showcase-feedback">
  <h2 class="catalog-section__title">Feedback</h2>
  <div class="catalog-panel catalog-grid catalog-doc-preview">
    <CatalogStateBlock stateId="sync-error" label="Error — SyncErrorBanner">
      <SyncErrorBanner {subscribe} {formatMessage} dismissLabel="Dismiss" />
    </CatalogStateBlock>
    <CatalogStateBlock stateId="warn" label="Warn toast">
      <Toast
        state={{ show: true, msg: 'Connection unstable', tone: 'warn' }}
        dismissLabel="Close"
        onDismiss={() => {}}
      />
    </CatalogStateBlock>
    <CatalogStateBlock stateId="error" label="Error + action">
      <Toast
        state={{
          show: true,
          msg: 'Save failed',
          tone: 'error',
          actionLabel: 'Retry',
          onAction: () => {},
        }}
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
