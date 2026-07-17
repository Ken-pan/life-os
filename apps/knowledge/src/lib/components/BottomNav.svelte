<script>
  // 移动端底栏：真·tab 切「笔记 / 知识」置于图标行之上，图标行只显当前模式的项 + 设置。
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import { LifeOsTabs } from '@life-os/platform-web/svelte/tabs'
  import { modeForPath, navItems, homeForMode } from '$lib/nav.js'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const mode = $derived(modeForPath(page.url.pathname))

  const tabs = $derived([
    { id: 'note', label: t('nav.modeNote') },
    { id: 'knowledge', label: t('nav.modeKnowledge') },
  ])
  const items = $derived(
    [
      ...navItems(mode, t),
      { href: '/settings', icon: 'settings', label: t('nav.settings') },
    ].map((item) => ({ ...item, active: isActive(item.href) })),
  )

  function switchMode(next) {
    if (next !== mode) goto(homeForMode(next))
  }
</script>

<div class="bnav-wrap">
  <div class="bnav-tabs">
    <LifeOsTabs
      items={tabs}
      activeId={mode}
      onChange={switchMode}
      ariaLabel={t('nav.modeAria')}
    />
  </div>
  <LifeOsBottomNav {items} ariaLabel={t('nav.mainAria')} navClass="bottom-nav" />
</div>

<style>
  .bnav-tabs {
    padding: var(--space-1, 4px) var(--space-4, 16px) 0;
  }
  .bnav-tabs :global(.tabs) {
    display: flex;
    width: 100%;
    gap: 0;
  }
  .bnav-tabs :global(.tab) {
    flex: 1;
    text-align: center;
  }
</style>
