<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { KENOS_SPACES } from '$lib/kenos/controlCenter.core.js'
  import { t } from '$lib/i18n/index.js'

  const hosted = [
    {
      id: 'training',
      label: 'Training',
      detail: '训练 Focus：隐藏全局导航，延期跨域打扰',
      href: '/spaces/training',
      external: false,
    },
    {
      id: 'work-focus',
      label: 'Work · Deep Work',
      detail: '进入当前项目专注；也可打开完整 Work hub',
      href: '/spaces/work',
      external: false,
    },
    {
      id: 'work',
      label: 'Work hub',
      detail: '项目、交付、会议与决定',
      href: '/work',
      external: false,
    },
  ]

  const spaces = [...hosted, ...KENOS_SPACES.map((s) => ({ ...s, external: true }))]
</script>

<div class="spaces-page">
  <header class="spaces-header">
    <p class="kicker">{t('nav.spaces')}</p>
    <h1>{t('nav.spaces')}</h1>
    <p class="intro">进入一个生活领域。其他 Space 不会一直占着导航。</p>
  </header>

  <nav class="space-grid" aria-label={t('nav.spaces')}>
    {#each spaces as space (space.id)}
      {#if space.external}
        <a class="space-card" href={space.href} target="_blank" rel="noopener noreferrer">
          <strong>{space.label}</strong>
          <span>{space.detail}</span>
          <Icon name="external" size={14} strokeWidth={1.75} />
        </a>
      {:else}
        <a class="space-card" href={space.href}>
          <strong>{space.label}</strong>
          <span>{space.detail}</span>
          <Icon name="chevron-right" size={14} strokeWidth={1.75} />
        </a>
      {/if}
    {/each}
  </nav>
</div>

<style>
  .spaces-page {
    width: min(100% - 32px, 880px);
    margin-inline: auto;
    padding: clamp(28px, 5vw, 64px) 0 96px;
  }
  .kicker {
    margin: 0 0 6px;
    color: var(--t3);
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    color: var(--t1);
    font-size: clamp(36px, 6vw, 56px);
    font-weight: 620;
    letter-spacing: -0.04em;
  }
  .intro {
    margin: 12px 0 0;
    color: var(--t2);
    font-size: var(--text-lg);
    max-width: 40rem;
  }
  .space-grid {
    display: grid;
    gap: 10px;
    margin-top: 36px;
  }
  .space-card {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 12px;
    row-gap: 4px;
    align-items: center;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 14px;
    color: inherit;
    text-decoration: none;
  }
  .space-card:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }
  .space-card strong {
    grid-column: 1;
    font-size: var(--text-lg);
  }
  .space-card span {
    grid-column: 1;
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .space-card :global(svg) {
    grid-column: 2;
    grid-row: 1 / span 2;
    color: var(--t3);
  }
</style>
