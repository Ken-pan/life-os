<script>
  import { enqueueArtResolve } from '$lib/artResolveQueue.js';
  import { portalToBody } from '$lib/portal.js';

  /** @type {{ artUrl?: string, resolve?: { albumKey: string, artist: string, album: string, title?: string }, inline?: boolean }} */
  let { artUrl = '', resolve = undefined, inline = false } = $props();

  let resolvedUrl = $state('');
  let artFailed = $state(false);
  let inputArtFailed = $state(false);
  const displayUrl = $derived((artUrl && !inputArtFailed) ? artUrl : resolvedUrl);

  $effect(() => {
    artUrl;
    inputArtFailed = false;
    artFailed = false;
    if (artUrl) resolvedUrl = '';
  });

  $effect(() => {
    if (!resolve || displayUrl || artFailed) return;

    let cancelled = false;
    void enqueueArtResolve(resolve).then((url) => {
      if (!cancelled && url && (!artUrl || inputArtFailed)) resolvedUrl = url;
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<div
  class="np-ambient-back"
  class:np-ambient-back--inline={inline}
  aria-hidden="true"
  use:portalToBody={{ enabled: !inline }}
>
  {#if displayUrl && !artFailed}
    <img
      class="np-ambient-back-art"
      src={displayUrl}
      alt=""
      decoding="async"
      crossorigin="anonymous"
      onerror={() => {
        if (artUrl && displayUrl === artUrl && resolve) {
          inputArtFailed = true;
          return;
        }
        artFailed = true;
      }}
    />
  {/if}
  <div class="np-ambient-back-mesh"></div>
  <div class="np-ambient-back-scrim"></div>
</div>
