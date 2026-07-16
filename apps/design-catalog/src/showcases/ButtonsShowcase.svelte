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

    <CatalogStateBlock stateId="icon" label="Icon buttons (.icon-btn)">
      <div class="catalog-row">
        <button type="button" class="icon-btn" aria-label="Edit">
          {@render pencilIcon()}
        </button>
        <button type="button" class="icon-btn">
          {@render pencilIcon()}
          Edit
        </button>
        <button type="button" class="icon-btn icon-btn--ghost" aria-label="Edit (ghost)">
          {@render pencilIcon()}
        </button>
        <button type="button" class="icon-btn icon-btn--danger" aria-label="Delete">
          {@render trashIcon()}
        </button>
        <button type="button" class="icon-btn" aria-label="Edit (disabled)" disabled>
          {@render pencilIcon()}
        </button>
      </div>
    </CatalogStateBlock>
  </div>
</section>

{#snippet pencilIcon()}
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
{/snippet}

{#snippet trashIcon()}
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6" />
  </svg>
{/snippet}

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 20px;
    font-size: var(--text-2xl);
  }
</style>
