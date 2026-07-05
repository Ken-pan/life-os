<script>
  import { artGradient } from '$lib/trackArt.js';

  /** @type {{ artUrl?: string, seed: string, class?: string, shared?: boolean }} */
  let { artUrl, seed, class: className = '', shared = false } = $props();

  const gradient = $derived(artGradient(seed));
</script>

{#if artUrl}
  <img
    class={className}
    src={artUrl}
    alt=""
    style:view-transition-name={shared ? 'player-art' : undefined}
  />
{:else}
  <div
    class="{className} placeholder"
    style:background={gradient}
    style:view-transition-name={shared ? 'player-art' : undefined}
    aria-hidden="true"
  >
    ♪
  </div>
{/if}
