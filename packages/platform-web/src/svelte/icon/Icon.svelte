<script>
  import { getContext } from 'svelte'
  import { ICON_REGISTRY_CONTEXT_KEY } from '../../iconRegistry.js'

  /** @type {{ name: string; size?: number; class?: string; strokeWidth?: number; fill?: string }} */
  let {
    name,
    size = 16,
    class: className = '',
    strokeWidth = 1.75,
    fill = 'none',
  } = $props()

  /** @type {Record<string, import('svelte').Component>} */
  const registry = getContext(ICON_REGISTRY_CONTEXT_KEY) ?? {}
  const Cmp = $derived(registry[name])
</script>

{#if Cmp}
  <Cmp class="icon {className}" {size} {strokeWidth} {fill} aria-hidden="true" />
{/if}
