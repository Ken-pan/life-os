<script>
  import { getContext } from 'svelte'
  import { CATALOG_CONTEXT_KEY } from './catalogContext.js'
  import { isCatalogStateVisible } from './showcaseStateFilter.js'

  /** @type {{ stateId: string, label?: string, children?: import('svelte').Snippet }} */
  let { stateId, label, children } = $props()

  const catalog = /** @type {{ state: string }} */ (
    getContext(CATALOG_CONTEXT_KEY)
  )

  const visible = $derived(isCatalogStateVisible(catalog.state, stateId))
</script>

{#if visible}
  <div class="catalog-state-block" data-catalog-state={stateId}>
    {#if label}
      <p class="catalog-state-label">{label}</p>
    {/if}
    {@render children?.()}
  </div>
{/if}
