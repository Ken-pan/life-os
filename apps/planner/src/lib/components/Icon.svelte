<script>
  import { ICONS } from '$lib/iconRegistry.js';

  /** @type {{ name: string; size?: number; class?: string; strokeWidth?: number }} */
  let { name, size = 16, class: className = '', strokeWidth = 1.75 } = $props();

  const Cmp = $derived(ICONS[name]);
</script>

{#if Cmp}
  <Cmp class="icon {className}" {size} {strokeWidth} aria-hidden="true" />
{/if}
