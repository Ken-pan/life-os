<script>
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  let activeFilters = $state(new Set(['strength']))
  const filters = [
    { id: 'strength', label: 'Strength' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'mobility', label: 'Mobility' },
    { id: 'recovery', label: 'Recovery' },
  ]

  let tags = $state(['barbell', 'compound', 'push'])

  function toggleFilter(id) {
    const next = new Set(activeFilters)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    activeFilters = next
  }
</script>

<section class="catalog-section" data-testid="showcase-chips">
  <h2 class="catalog-section__title">Chips (.chip)</h2>
  <p class="catalog-section__lead">
    静态 <code>.chip</code> / <code>.chip.tag</code> 之上的交互态：
    <code>button.chip</code>（filter，选中走 <code>aria-pressed</code>）与
    <code>.chip__remove</code>（可移除 tag）；横向排列用 <code>.chip-row</code>。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Static / tag">
      <div class="chip-row">
        <span class="chip">v2.4.1</span>
        <span class="chip">draft</span>
        <span class="chip tag">strength</span>
        <span class="chip tag">compound</span>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="filter" label="Filter (aria-pressed)">
      <div class="chip-row">
        {#each filters as f (f.id)}
          <button
            type="button"
            class="chip"
            aria-pressed={activeFilters.has(f.id)}
            onclick={() => toggleFilter(f.id)}
          >
            {f.label}
          </button>
        {/each}
        <button type="button" class="chip" disabled>Locked</button>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="removable" label="Removable tags">
      <div class="chip-row">
        {#each tags as tag (tag)}
          <span class="chip tag">
            {tag}
            <button
              type="button"
              class="chip__remove"
              aria-label={`Remove ${tag}`}
              onclick={() => (tags = tags.filter((t) => t !== tag))}
            >
              <svg
                viewBox="0 0 24 24"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        {/each}
        {#if tags.length === 0}
          <span class="chip">no tags</span>
        {/if}
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
</style>
