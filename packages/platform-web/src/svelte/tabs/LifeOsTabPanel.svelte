<script>
  // 从 finance TabPanel 下沉（2026-07-16）；须包在 LifeOsTabs 的 children 里。
  import { getContext } from 'svelte'
  import {
    TAB_GROUP_CONTEXT_KEY,
    tabPanelId,
    tabButtonId,
  } from './LifeOsTabs.svelte'

  /** @type {{ tabId: string, active: boolean, class?: string, children?: import('svelte').Snippet }} */
  let { tabId, active, class: klass = '', children } = $props()

  const ctx = getContext(TAB_GROUP_CONTEXT_KEY)
  const panelId = $derived(tabPanelId(ctx.prefix, tabId))
  const labelId = $derived(tabButtonId(ctx.prefix, tabId))
</script>

<div
  role="tabpanel"
  id={panelId}
  aria-labelledby={labelId}
  hidden={!active}
  class={klass}
  tabindex={active ? 0 : undefined}
>
  {#if active}
    {@render children?.()}
  {/if}
</div>
