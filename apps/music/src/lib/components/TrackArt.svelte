<script>
  import { artGradient } from '$lib/trackArt.js';
  import { requestArtForAlbum } from '$lib/artResolver.js';
  import { librarySignals } from '$lib/state.svelte.js';

  /** @type {{
   *   artUrl?: string,
   *   seed: string,
   *   class?: string,
   *   shared?: boolean,
   *   lazy?: boolean,
   *   priority?: 'high' | 'low' | 'auto',
   *   resolve?: { albumKey: string, artist: string, album: string, title?: string }
   * }} */
  let {
    artUrl,
    seed,
    class: className = '',
    shared = false,
    lazy = false,
    priority = 'auto',
    resolve = undefined
  } = $props();

  const gradient = $derived(artGradient(seed));
  let artFailed = $state(false);
  let resolvedUrl = $state('');

  const displayUrl = $derived(artUrl || resolvedUrl);
  const fetchPriority = $derived(priority === 'auto' ? (shared ? 'high' : 'low') : priority);

  $effect(() => {
    artUrl;
    artFailed = false;
  });

  $effect(() => {
    void librarySignals.epoch;
    if (artUrl) resolvedUrl = '';
  });

  $effect(() => {
    if (displayUrl || artFailed || !resolve) return;

    let cancelled = false;
    void requestArtForAlbum(resolve).then((url) => {
      if (!cancelled && url && !artUrl) resolvedUrl = url;
    });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if displayUrl && !artFailed}
  <img
    class={className}
    src={displayUrl}
    alt=""
    loading={lazy ? 'lazy' : undefined}
    decoding="async"
    fetchpriority={fetchPriority}
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
