<script>
  import Toast from '@life-os/platform-web/svelte/toast'
</script>

<section class="catalog-section" data-testid="showcase-toast">
  <h2 class="catalog-section__title">Toast component</h2>
  <div class="catalog-panel catalog-grid">
    <div class="catalog-state-block">
      <p class="catalog-state-label">Success + action</p>
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
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">Info</p>
      <Toast
        state={{ show: true, msg: 'Saved', tone: 'info' }}
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
