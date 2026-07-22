<script>
  import Icon from '@life-os/platform-web/svelte/icon'
  import { goto } from '$app/navigation'
  import { buildSpacesList } from '$lib/kenos/spacesList.core.js'
  import { launchSpace } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { isShellSurface } from '$lib/kenos/shellSurface.js'
  import { t } from '$lib/i18n/index.js'

  // shellOnly 域(Code)只在 Mac/iOS 壳内列出,普通浏览器隐藏。
  const spaces = buildSpacesList({ shellAllowed: isShellSurface() })
  const focusSpaces = spaces.filter((s) => s.id === 'training' || s.id === 'work-focus')
  const domainSpaces = spaces.filter((s) => !['training', 'work-focus'].includes(s.id))

  /**
   * @param {import('$lib/kenos/spaceSwitcher.core.js').SpaceEntry} space
   * @param {MouseEvent} event
   */
  function onOpenSpace(space, event) {
    event.preventDefault()
    launchSpace(space, { goto })
  }
</script>

<div class="spaces-page">
  <header class="spaces-header">
    <div class="spaces-header-main">
      <h1 class="kenos-page-title">{t('nav.spaces')}</h1>
      <p class="intro">进入一个生活领域。Continue 负责回到你刚才做到的地方。</p>
    </div>
  </header>

  <section class="group" aria-labelledby="spaces-focus">
    <h2 id="spaces-focus" class="group-title">Focus</h2>
    <nav class="space-list" aria-label="Focus shortcuts">
      {#each focusSpaces as space (space.listKey)}
        <a
          class="space-row"
          href={space.href}
          data-space-id={space.id}
          style:--space-accent={space.accent || 'transparent'}
          onclick={(e) => onOpenSpace(space, e)}
        >
          <span
            class="accent"
            style:background={space.accent || 'var(--border)'}
            aria-hidden="true"
          ></span>
          {#if space.icon}
            <span
              class="space-icon"
              style:color={space.accent
                ? `color-mix(in srgb, ${space.accent} 78%, var(--t2))`
                : 'var(--t2)'}
              aria-hidden="true"
            >
              <Icon name={space.icon} size={16} strokeWidth={1.75} />
            </span>
          {/if}
          <span class="space-text">
            <strong>{space.label}</strong>
            <span>{space.detail}</span>
          </span>
        </a>
      {/each}
    </nav>
  </section>

  <section class="group" aria-labelledby="spaces-domains">
    <h2 id="spaces-domains" class="group-title">Domains</h2>
    <nav class="space-list" aria-label="Domain spaces">
      {#each domainSpaces as space (space.listKey)}
        <a
          class="space-row"
          class:preparing={space.availability === 'preparing'}
          href={space.href}
          data-space-id={space.id}
          style:--space-accent={space.accent || 'transparent'}
          onclick={(e) => onOpenSpace(space, e)}
        >
          <span
            class="accent"
            style:background={space.accent || 'var(--border)'}
            aria-hidden="true"
          ></span>
          {#if space.icon}
            <span
              class="space-icon"
              style:color={space.accent
                ? `color-mix(in srgb, ${space.accent} 78%, var(--t2))`
                : 'var(--t2)'}
              aria-hidden="true"
            >
              <Icon name={space.icon} size={16} strokeWidth={1.75} />
            </span>
          {/if}
          <span class="space-text">
            <strong>{space.label}</strong>
            <span>{space.detail}</span>
          </span>
          {#if space.availability === 'preparing'}
            <span class="badge">准备中</span>
          {/if}
        </a>
      {/each}
    </nav>
  </section>
</div>

<style>
  .spaces-page {
    width: min(100% - (2 * var(--kenos-space-inline, 16px)), var(--kenos-content-max, 820px));
    margin-inline: auto;
    padding: var(--kenos-space-page-top, 24px) 0 var(--kenos-mobile-bottom-pad, 96px);
  }
  @media (max-width: 899px) {
    .spaces-header .kenos-page-title,
    .spaces-header :global(.kenos-page-title) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  }
  .intro {
    margin: var(--kenos-title-to-body, 10px) 0 0;
    color: var(--t2);
    font-size: var(--kenos-type-body);
    line-height: var(--kenos-leading-body);
    max-width: 36rem;
  }
  .group {
    margin-top: var(--kenos-section-gap, 32px);
  }
  .group-title {
    margin: 0 0 8px;
    color: var(--t3);
    font-size: var(--kenos-type-meta, var(--text-xs));
    font-weight: 650;
    letter-spacing: var(--kenos-tracking-meta, 0.06em);
    text-transform: uppercase;
  }
  /* Row hairlines only — no outer box that reads as a soft card group */
  .space-list {
    display: grid;
    gap: 0;
    border: 0;
    background: transparent;
  }
  .space-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 12px 4px;
    border: 0;
    color: inherit;
    text-decoration: none;
    background: transparent;
  }
  .space-row + .space-row {
    border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  }
  .space-row:hover {
    background: color-mix(in srgb, var(--space-accent, transparent) 7%, transparent);
  }
  .space-row.preparing {
    opacity: 0.88;
  }
  .accent {
    width: 3px;
    align-self: stretch;
    min-height: 28px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .space-icon {
    display: inline-flex;
    color: var(--t2);
    flex-shrink: 0;
    opacity: 0.9;
  }
  .space-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .space-text strong {
    font-size: var(--kenos-type-list, var(--text-lg));
    font-weight: var(--kenos-weight-list, 600);
  }
  .space-text span {
    color: var(--t3);
    font-size: var(--kenos-type-meta, var(--text-sm));
    letter-spacing: 0;
    text-transform: none;
    font-weight: 450;
  }
  .badge {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--t3);
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--kenos-surface-raised);
  }
</style>
