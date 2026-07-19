<script>
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import { t } from '$lib/i18n/index.js'
  import { isSystemNavActive, systemNavItems, SYSTEM_NAV_HREFS } from '$lib/kenos/systemNav.js'
  import { clearAssistantContext } from '$lib/kenos/assistantContext.svelte.js'

  const items = $derived(
    systemNavItems(t).map((item) => ({
      ...item,
      active: isSystemNavActive(page.url.pathname, item.href),
    })),
  )

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

<div use:clearGlobalAssistantContext>
  <LifeOsBottomNav {items} ariaLabel={t('nav.mainAria')} navClass="bottom-nav" />
</div>
