<script>
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import { t } from '$lib/i18n/index.js'
  import { isSystemNavActive, systemNavItems, SYSTEM_NAV_HREFS } from '$lib/kenos/systemNav.js'
  import { clearAssistantContext } from '$lib/kenos/assistantContext.svelte.js'
  import { SPACE_SWITCHER } from '$lib/kenos/spaceSwitcher.svelte.js'

  const items = $derived(
    systemNavItems(t).map((item) => ({
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
  <LifeOsBottomNav
    {items}
    ariaLabel={t('nav.mainAria')}
    navClass="bottom-nav"
    backgrounded={continueOpen}
  />
</div>

<style>
  .bottom-nav-host.is-suppressed {
    visibility: hidden;
    pointer-events: none;
  }
</style>
