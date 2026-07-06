<script>
  import { ICONS } from '$lib/iconRegistry.js';

  /** @type {{ name: string; size?: number; class?: string; strokeWidth?: number; fill?: string }} */
  let {
    name,
    size = 16,
    class: className = '',
    strokeWidth = 1.75,
    fill = 'none',
  } = $props();
  const Cmp = $derived(ICONS[name]);
</script>

{#if Cmp}
  <Cmp class="icon {className}" {size} {strokeWidth} {fill} aria-hidden="true" />
{/if}
