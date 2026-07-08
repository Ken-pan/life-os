<script>
  import { getContext } from 'svelte'
  import { CATALOG_CONTEXT_KEY } from '../lib/catalogContext.js'

  const catalog = /** @type {{ app: string }} */ (getContext(CATALOG_CONTEXT_KEY))

  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
    { value: 'c', label: 'Option C' },
  ]
  let value = $state('a')

  const segClass = $derived.by(() => {
    switch (catalog.app) {
      case 'fitness':
        return 'seg seg-track seg--wrap'
      case 'planner':
        return 'seg seg-chips seg--wrap'
      default:
        return 'seg seg--wrap'
    }
  })

  const segLabel = $derived.by(() => {
    switch (catalog.app) {
      case 'fitness':
        return 'Fitness track (.seg-track)'
      case 'planner':
        return 'Planner chips (.seg-chips)'
      default:
        return 'Default pill (.seg)'
    }
  })
</script>

<section class="catalog-section" data-testid="showcase-segments">
  <h2 class="catalog-section__title">Segments (.seg)</h2>
  <p class="catalog-section__lead">{segLabel} — switches with App selector above.</p>
  <div class="catalog-panel">
    <div class={segClass} role="group" aria-label="Demo segment">
      {#each options as opt}
        <button
          type="button"
          class:on={value === opt.value}
          class:active={value === opt.value}
          aria-pressed={value === opt.value}
          onclick={() => (value = opt.value)}
        >
          {opt.label}
        </button>
      {/each}
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
  .catalog-section__lead {
    margin: -8px 0 16px;
    color: var(--t2, var(--text-secondary));
    font-size: 13px;
  }
</style>
