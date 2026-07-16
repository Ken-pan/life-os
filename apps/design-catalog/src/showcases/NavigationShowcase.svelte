<script>
  import BackButton from '@life-os/platform-web/svelte/navigation'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import { NAV_GROUPS } from '../fixtures/navigation.js'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  let sheetOpen = $state(false)
</script>

<section class="catalog-section" data-testid="showcase-navigation">
  <h2 class="catalog-section__title">Navigation</h2>
  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="BackButton">
      <BackButton href="/" label="Back" />
    </CatalogStateBlock>

    <CatalogStateBlock stateId="sheet-open" label="MobileMoreSheet (open preview)">
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
    </CatalogStateBlock>

    <CatalogStateBlock stateId="detail:interactive" label="MobileMoreSheet (interactive)">
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
    </CatalogStateBlock>
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
