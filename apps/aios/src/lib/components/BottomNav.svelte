<script>
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import { t } from '$lib/i18n/index.js'
  import { isSystemNavActive, systemNavItems } from '$lib/kenos/systemNav.js'

  const items = $derived(
    systemNavItems(t).map((item) => ({
      ...item,
      active: isSystemNavActive(page.url.pathname, item.href),
    })),
  )
</script>

<LifeOsBottomNav {items} ariaLabel={t('nav.mainAria')} navClass="bottom-nav" />
