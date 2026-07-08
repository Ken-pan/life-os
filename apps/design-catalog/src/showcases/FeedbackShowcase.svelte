<script>
  import SyncErrorBanner from '@life-os/platform-web/svelte/sync-error'
  import Toast from '@life-os/platform-web/svelte/toast'

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
  <div class="catalog-panel catalog-grid">
    <div class="catalog-state-block">
      <p class="catalog-state-label">Error — SyncErrorBanner</p>
      <SyncErrorBanner {subscribe} {formatMessage} dismissLabel="Dismiss" />
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Warn toast</p>
      <Toast
        state={{ show: true, msg: 'Connection unstable', tone: 'warn' }}
        dismissLabel="Close"
        onDismiss={() => {}}
      />
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Error + action</p>
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
    </div>
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
