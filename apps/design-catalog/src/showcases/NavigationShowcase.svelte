<script>
  import BackButton from '@life-os/platform-web/svelte/navigation'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import { NAV_GROUPS } from '../fixtures/navigation.js'

  let sheetOpen = $state(false)
</script>

<section class="catalog-section" data-testid="showcase-navigation">
  <h2 class="catalog-section__title">Navigation</h2>
  <div class="catalog-panel catalog-grid">
    <div class="catalog-state-block">
      <p class="catalog-state-label">BackButton</p>
      <BackButton href="/" label="Back" />
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">MobileMoreSheet (open preview)</p>
      <div class="catalog-doc-preview catalog-doc-preview--sheet">
        <MobileMoreSheet
          open={true}
          title="More"
          groups={NAV_GROUPS}
          pathname="/"
          closeLabel="Close"
          manageFocus={false}
          onClose={() => {}}
        />
      </div>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">MobileMoreSheet (interactive)</p>
      <button
        type="button"
        class="btn-secondary"
        onclick={() => (sheetOpen = true)}>Open sheet</button
      >
      <MobileMoreSheet
        open={sheetOpen}
        title="More"
        groups={NAV_GROUPS}
        pathname="/"
        closeLabel="Close"
        onClose={() => (sheetOpen = false)}
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
