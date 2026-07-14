<script>
  import { t } from '$lib/i18n/index.js'
  import Icon from '@life-os/platform-web/svelte/icon'
  import TrackArt from './TrackArt.svelte'
  import { formatTime } from '$lib/player.svelte.js'

  /**
   * @type {{
   *   kicker: string,
   *   title: string,
   *   subtitle?: string,
   *   subtitleHref?: string,
   *   count: number,
   *   totalDuration?: number,
   *   monogram?: string,
   *   art?: { artUrl?: string, seed: string, resolve?: { albumKey: string, artist: string, album: string, title?: string } },
   *   onPlay: () => void,
   *   onShuffle?: () => void,
   * }}
   */
  let {
    kicker,
    title,
    subtitle = '',
    subtitleHref = '',
    count,
    totalDuration = 0,
    monogram = '',
    art = undefined,
    onPlay,
    onShuffle = undefined,
  } = $props()

  const meta = $derived(
    [
      count > 0 ? t('common.songs', { count }) : '',
      totalDuration > 0 ? formatTime(totalDuration) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  )
  const canPlay = $derived(count > 0)
</script>

<header class="detail-hero" class:detail-hero--round={Boolean(monogram)}>
  <div class="detail-hero-art" aria-hidden="true">
    {#if monogram}
      <div class="detail-hero-avatar">{monogram}</div>
    {:else if art}
      <TrackArt
        class="detail-hero-cover"
        artUrl={art.artUrl}
        seed={art.seed}
        resolve={art.resolve}
        priority="high"
      />
    {/if}
  </div>

  <div class="detail-hero-info">
    <p class="detail-hero-kicker">{kicker}</p>
    <h1 class="detail-hero-title">{title}</h1>
    {#if subtitle}
      {#if subtitleHref}
        <a class="detail-hero-sub detail-hero-sub--link" href={subtitleHref}
          >{subtitle}</a
        >
      {:else}
        <p class="detail-hero-sub">{subtitle}</p>
      {/if}
    {/if}
    {#if meta}
      <p class="detail-hero-meta">{meta}</p>
    {/if}
    {#if canPlay}
      <div class="detail-hero-actions">
        <button type="button" class="btn-primary" onclick={onPlay}>
          <Icon name="play" size={16} />
          <span>{t('common.play')}</span>
        </button>
        {#if onShuffle}
          <button type="button" class="btn-secondary" onclick={onShuffle}>
            <Icon name="shuffle" size={16} />
            <span>{t('common.shuffle')}</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</header>

<style>
  .detail-hero {
    display: flex;
    align-items: flex-end;
    gap: var(--space-5);
    margin-bottom: var(--space-5);
  }

  .detail-hero-art {
    flex-shrink: 0;
  }

  :global(.detail-hero-cover),
  .detail-hero-avatar {
    width: 200px;
    height: 200px;
    border-radius: var(--radius-lg);
    box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.7);
  }

  .detail-hero--round :global(.detail-hero-cover),
  .detail-hero--round .detail-hero-avatar {
    border-radius: 999px;
  }

  .detail-hero-avatar {
    display: grid;
    place-items: center;
    font-family: var(--disp, var(--font-brand));
    font-size: clamp(3rem, 8vw, 4.5rem);
    font-weight: 600;
    color: var(--on-accent, #fff);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--accent) 78%, transparent),
      color-mix(in srgb, var(--player-glow, var(--accent)) 55%, transparent)
    );
  }

  .detail-hero-info {
    min-width: 0;
    padding-bottom: var(--space-1);
  }

  .detail-hero-kicker {
    font-family: var(--mono);
    font-size: var(--text-xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--track-accent, var(--accent));
    margin: 0 0 var(--space-2);
  }

  .detail-hero-title {
    font-family: var(--disp, var(--font-brand));
    font-size: clamp(var(--text-2xl), 5vw, var(--text-display-sm));
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
    margin: 0;
  }

  .detail-hero-sub {
    margin: var(--space-2) 0 0;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-base);
  }

  .detail-hero-sub--link {
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .detail-hero-sub--link:hover {
    color: var(--t1, var(--text));
    text-decoration: underline;
  }

  .detail-hero-meta {
    margin: var(--space-1) 0 0;
    color: var(--t3, var(--text-tertiary, var(--text-secondary)));
    font-size: var(--text-sm);
  }

  .detail-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .detail-hero-actions .btn-primary,
  .detail-hero-actions .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  @media (max-width: 640px) {
    .detail-hero {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-4);
    }

    :global(.detail-hero-cover),
    .detail-hero-avatar {
      width: 144px;
      height: 144px;
    }
  }
</style>
