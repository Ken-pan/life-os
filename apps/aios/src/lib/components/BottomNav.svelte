<script>
  import { page } from '$app/state'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import {
    isSystemNavActive,
    systemNavCapsuleItems,
    systemNavSpacesItem,
    SYSTEM_NAV_HREFS,
  } from '$lib/kenos/systemNav.js'
  import { clearAssistantContext } from '$lib/kenos/assistantContext.svelte.js'
  import { SPACE_SWITCHER } from '$lib/kenos/spaceSwitcher.svelte.js'

  const spacesItem = $derived({
    ...systemNavSpacesItem(t),
    active: isSystemNavActive(page.url.pathname, SYSTEM_NAV_HREFS.spaces),
  })

  const capsuleItems = $derived(
    systemNavCapsuleItems(t).map((item) => ({
      ...item,
      active: isSystemNavActive(page.url.pathname, item.href),
    })),
  )

  /** Continue sheet open — nav must sit fully under scrim (non-interactive). */
  const continueOpen = $derived(SPACE_SWITCHER.sheetOpen)

  /** Global Assistant tab — leave soft Work context (not Work's Context Assistant). */
  function clearGlobalAssistantContext(node) {
    const onClick = (event) => {
      const link = event.target?.closest?.('a[href]')
      if (!link || !node.contains(link)) return
      if (link.getAttribute('href') === SYSTEM_NAV_HREFS.assistant) {
        clearAssistantContext()
      }
    }
    node.addEventListener('click', onClick)
    return {
      destroy() {
        node.removeEventListener('click', onClick)
      },
    }
  }
</script>

<!-- Continue lives in KenosSystemBar (mobile) / AppBar+Sidebar (desktop) — not over content. -->
<div
  class="bottom-nav-host"
  class:is-suppressed={continueOpen}
  use:clearGlobalAssistantContext
  inert={continueOpen || undefined}
  aria-hidden={continueOpen ? 'true' : undefined}
>
  <nav
    class="nav kenos-split-nav kenos-icon-nav"
    aria-label={t('nav.mainAria')}
    data-testid="aios-shell-bottom-nav"
  >
    <a
      class="nav-item spaces-chip"
      href={spacesItem.href}
      data-sveltekit-noscroll
      aria-current={spacesItem.active ? 'page' : undefined}
      aria-label={spacesItem.label}
      data-testid="kenos-nav-spaces"
      title={spacesItem.label}
    >
      <Icon name="chevron-right" size={14} strokeWidth={2.1} />
    </a>

    <div class="nav-inner capsule" role="presentation">
      {#each capsuleItems as item (item.key ?? item.href)}
        <a
          class="nav-item"
          class:on={item.active}
          href={item.href}
          data-sveltekit-noscroll
          aria-current={item.active ? 'page' : undefined}
          aria-label={item.label}
          data-testid={`kenos-nav-${item.key}`}
          title={item.label}
        >
          <Icon
            name={item.icon}
            size={25}
            strokeWidth={item.active ? 1.9 : 1.6}
          />
        </a>
      {/each}
    </div>
  </nav>
</div>

<style>
  .bottom-nav-host.is-suppressed {
    visibility: hidden;
    pointer-events: none;
  }

  /*
   * Split dock (honest mapping):
   * - Capsule ≈ iOS 26 floating Tab Bar language
   * - Spaces tip ≠ system tab — leading drawer affordance
   */
  :global(.kenos-split-nav.kenos-icon-nav) {
    --kenos-dock-gap: 10px;
    --kenos-dock-pad: 3px;
    --kenos-dock-radius: 999px;
    --kenos-dock-hit: 48px;
    --kenos-dock-tip-w: 20px;
    --kenos-dock-idle: color-mix(in srgb, #fff 92%, transparent);
    --kenos-dock-glass: color-mix(
      in srgb,
      var(--card, #1a1c1e) 88%,
      transparent
    );
    /* iOS 26 selected capsule ≈ dark gray, not accent wash */
    --kenos-dock-sel: color-mix(in srgb, #000 42%, transparent);

    display: flex;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--kenos-dock-gap);
    padding: 0 max(14px, env(safe-area-inset-right, 0px))
      calc(6px + env(safe-area-inset-bottom, 0px)) 0;
    pointer-events: none;
  }

  :global(.kenos-split-nav.kenos-icon-nav .capsule) {
    pointer-events: auto;
    flex: 1 1 auto;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 0;
    padding: var(--kenos-dock-pad);
    min-height: calc(var(--kenos-dock-hit) + var(--kenos-dock-pad) * 2);
    background: var(--kenos-dock-glass);
    backdrop-filter: blur(40px) saturate(1.5);
    -webkit-backdrop-filter: blur(40px) saturate(1.5);
    border-radius: var(--kenos-dock-radius);
    box-shadow: none;
  }

  :global(.kenos-split-nav.kenos-icon-nav .capsule .nav-item) {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 0;
    min-width: 0;
    min-height: var(--kenos-dock-hit);
    margin: 2px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent !important;
    color: var(--kenos-dock-idle);
    box-shadow: none;
    transition:
      color 180ms ease,
      background-color 180ms ease,
      transform 160ms ease;
  }

  :global(.kenos-split-nav.kenos-icon-nav .capsule .nav-item:active) {
    transform: scale(0.94);
  }

  :global(.kenos-split-nav.kenos-icon-nav .capsule .nav-item.on) {
    color: var(--accent, #5b8cff);
    background: var(--kenos-dock-sel) !important;
    box-shadow: none;
  }

  :global(.kenos-split-nav.kenos-icon-nav .capsule .nav-item:not(.on)) {
    color: var(--kenos-dock-idle);
  }

  /* Compact edge tip — chevron drawer hint */
  :global(.kenos-split-nav.kenos-icon-nav a.spaces-chip.nav-item) {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    /* Visual tip stays slim; hit target expands toward capsule gap (≈44px). */
    width: calc(var(--kenos-dock-tip-w) + 20px);
    min-height: max(
      44px,
      calc(var(--kenos-dock-hit) + var(--kenos-dock-pad) * 2)
    );
    margin: 0;
    padding: 0 14px 0 0;
    border: none;
    border-radius: 0 28px 28px 0;
    background: color-mix(
      in srgb,
      var(--card, #1a1c1e) 88%,
      transparent
    ) !important;
    color: var(--kenos-dock-idle);
    backdrop-filter: blur(40px) saturate(1.5);
    -webkit-backdrop-filter: blur(40px) saturate(1.5);
    box-shadow: none;
    opacity: 0.92;
  }

  :global(.kenos-split-nav.kenos-icon-nav a.spaces-chip.nav-item:active) {
    transform: scale(0.96);
  }

  :global(.kenos-split-nav.kenos-icon-nav .nav-item.on svg),
  :global(.kenos-split-nav.kenos-icon-nav .nav-item.active svg) {
    padding: 0 !important;
    background: transparent !important;
    border-radius: 0 !important;
    animation: none !important;
    color: inherit;
  }

  :global(.kenos-split-nav.kenos-icon-nav .nav-lbl) {
    display: none !important;
  }

  :global(html[data-ios-native-shell='true'] .bottom-nav-host) {
    display: none !important;
  }
</style>
