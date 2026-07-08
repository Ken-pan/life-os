<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const states = [
    { id: 'default', label: 'Default', props: {} },
    { id: 'disabled', label: 'Disabled', props: { disabled: true } },
  ]
</script>

<section class="catalog-section" data-testid="showcase-buttons">
  <h2 class="catalog-section__title">Buttons</h2>
  <div class="catalog-grid">
    {#each states as state}
      <CatalogStateBlock stateId={state.id} label={state.label}>
        <div class="catalog-row">
          <button
            type="button"
            class="btn-primary"
            disabled={state.props.disabled}>Primary</button
          >
          <button
            type="button"
            class="btn-secondary"
            disabled={state.props.disabled}>Secondary</button
          >
          <button
            type="button"
            class="btn-ghost"
            disabled={state.props.disabled}>Ghost</button
          >
          <button
            type="button"
            class="btn-danger"
            disabled={state.props.disabled}>Danger</button
          >
        </div>
      </CatalogStateBlock>
    {/each}
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
