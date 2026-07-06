<script>
  import { artGradient } from '$lib/trackArt.js';

  /** @type {{ artUrl?: string, seed: string, class?: string, shared?: boolean }} */
  let { artUrl, seed, class: className = '', shared = false } = $props();

  const gradient = $derived(artGradient(seed));
  let artFailed = $state(false);

  $effect(() => {
    artUrl;
    artFailed = false;
  });
</script>

{#if artUrl && !artFailed}
  <img
    class={className}
    src={artUrl}
    alt=""
    style:view-transition-name={shared ? 'player-art' : undefined}
    onerror={() => {
      artFailed = true;
    }}
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
