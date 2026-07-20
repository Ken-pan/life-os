<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { buildSpacesList } from '$lib/kenos/spacesList.core.js'
  import { t } from '$lib/i18n/index.js'

  const spaces = buildSpacesList()
  const hosted = spaces.filter((s) => !s.external)
  const external = spaces.filter((s) => s.external)
</script>

<div class="spaces-page">
  <header class="spaces-header">
    <p class="kicker">{t('nav.spaces')}</p>
    <h1>{t('nav.spaces')}</h1>
    <p class="intro">进入一个生活领域。其他 Space 不会一直占着导航。</p>
  </header>

  <section class="group" aria-labelledby="spaces-focus">
    <h2 id="spaces-focus" class="group-title">Focus</h2>
    <nav class="space-list" aria-label="Focus shortcuts">
      <a class="space-row" href="/spaces/training">
        <span class="space-text">
          <strong>Training Focus</strong>
          <span>隐藏跨域打扰，进入训练专注</span>
        </span>
        <Icon name="chevron-right" size={14} strokeWidth={1.75} />
      </a>
      <a class="space-row" href="/spaces/work">
        <span class="space-text">
          <strong>Deep Work Focus</strong>
          <span>留在 Work / Plan 语境</span>
        </span>
        <Icon name="chevron-right" size={14} strokeWidth={1.75} />
      </a>
    </nav>
  </section>

  <section class="group" aria-labelledby="spaces-hosted">
    <h2 id="spaces-hosted" class="group-title">In Kenos</h2>
    <nav class="space-list" aria-label="Hosted spaces">
      {#each hosted as space (space.listKey)}
        <a class="space-row" href={space.href}>
          <span class="space-text">
            <strong>{space.label}</strong>
            <span>{space.detail}</span>
          </span>
          <Icon name="chevron-right" size={14} strokeWidth={1.75} />
        </a>
      {/each}
    </nav>
  </section>

  <section class="group" aria-labelledby="spaces-external">
    <h2 id="spaces-external" class="group-title">Domain apps</h2>
    <nav class="space-list" aria-label="External spaces">
      {#each external as space (space.listKey)}
        <a class="space-row" href={space.href} target="_blank" rel="noopener noreferrer">
          <span class="space-text">
            <strong>{space.label}</strong>
            <span>{space.detail}</span>
          </span>
          <Icon name="external" size={14} strokeWidth={1.75} />
        </a>
      {/each}
    </nav>
  </section>
</div>

<style>
  .spaces-page {
    width: min(100% - 32px, var(--content-max, 820px));
    margin-inline: auto;
    padding: clamp(24px, 4vw, 48px) 0 96px;
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
    font-size: clamp(32px, 5vw, 48px);
    font-weight: 620;
    letter-spacing: -0.04em;
  }
  .intro {
    margin: 12px 0 0;
    color: var(--t2);
    font-size: var(--text-lg);
    max-width: 40rem;
  }
  .group {
    margin-top: 32px;
  }
  .group-title {
    margin: 0 0 10px;
    color: var(--t3);
    font-size: var(--text-xs, 12px);
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .space-list {
    display: grid;
    gap: 0;
    border-top: 1px solid var(--border);
  }
  .space-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 14px 2px;
    border-bottom: 1px solid var(--border);
    color: inherit;
    text-decoration: none;
  }
  .space-row:hover {
    background: color-mix(in srgb, var(--t1) 3%, transparent);
  }
  .space-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .space-text strong {
    font-size: var(--text-lg);
    font-weight: 600;
  }
  .space-text span {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .space-row :global(svg) {
    color: var(--t3);
    flex-shrink: 0;
  }
</style>
