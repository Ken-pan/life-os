<script>
  import { artGradient } from '$lib/trackArt.js'
  import { enqueueArtResolve } from '$lib/artResolveQueue.js'
  import { librarySignals } from '$lib/state.svelte.js'

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
    resolve = undefined,
  } = $props()

  const gradient = $derived(artGradient(seed))
  let artFailed = $state(false)
  let inputArtFailed = $state(false)
  let resolvedUrl = $state('')
  /** @type {HTMLElement | null} */
  let root = $state(null)
  let inView = $state(false)

  const displayUrl = $derived((artUrl && !inputArtFailed) ? artUrl : resolvedUrl)
  const fetchPriority = $derived(
    priority === 'auto' ? (shared ? 'high' : 'low') : priority,
  )
  const shouldResolve = $derived(
    Boolean(
      resolve && !displayUrl && !artFailed && (shared || !lazy || inView),
    ),
  )

  $effect(() => {
    artUrl
    inputArtFailed = false
    artFailed = false
  })

  $effect(() => {
    void librarySignals.epoch
    if (artUrl && !inputArtFailed) resolvedUrl = ''
  })

  $effect(() => {
    if (!lazy || !root || !resolve) {
      if (!lazy) inView = true
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
      },
      { rootMargin: '240px 0px', threshold: 0.01 },
    )
    io.observe(root)
    return () => io.disconnect()
  })

  $effect(() => {
    if (!shouldResolve || !resolve) return

    let cancelled = false
    void enqueueArtResolve(resolve).then((url) => {
      if (!cancelled && url && !artUrl) resolvedUrl = url
    })

    return () => {
      cancelled = true
    }
  })
</script>

<div class="{className} track-art-root" bind:this={root}>
  {#if displayUrl && !artFailed}
    <img
      class="track-art-img"
      src={displayUrl}
      alt=""
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
      fetchpriority={fetchPriority}
      style:view-transition-name={shared ? 'player-art' : undefined}
      onerror={() => {
        if (artUrl && displayUrl === artUrl && resolve) {
          inputArtFailed = true
          return
        }
        artFailed = true
      }}
    />
  {:else}
    <div
      class="track-art-img placeholder"
      style:background={gradient}
      style:view-transition-name={shared ? 'player-art' : undefined}
      aria-hidden="true"
    >
      ♪
    </div>
  {/if}
</div>

<style>
  .track-art-root {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }

  .track-art-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: color-mix(in srgb, var(--on-accent, #fff) 88%, transparent);
    font-size: 1.25rem;
  }
</style>
