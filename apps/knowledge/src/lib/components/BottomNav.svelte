<script>
  // 移动端底栏：Inbox · Library · Recall +「更多」（项目 / 时间线 / 概览 / 设置）。
  import { page } from '$app/state'
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav'
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet'
  import { primaryNavItems, moreNavGroups, isMoreNavActive } from '$lib/nav.js'
  import { t } from '$lib/i18n/index.js'

  let moreOpen = $state(false)

  const pathname = $derived(page.url.pathname)
  const moreActive = $derived(isMoreNavActive(pathname))

  const isActive = (href) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const items = $derived(
    primaryNavItems(t).map((item) => ({
      ...item,
      active: isActive(item.href) && !moreActive,
    })),
  )
  const moreGroups = $derived(moreNavGroups(t))

  $effect(() => {
    pathname
    moreOpen = false
  })
</script>

<LifeOsBottomNav
  {items}
  ariaLabel={t('nav.mainAria')}
  navClass="bottom-nav"
  backgrounded={moreOpen}
  more={{
    label: t('nav.more'),
    active: moreActive,
    open: moreOpen,
    onToggle: () => {
      moreOpen = !moreOpen
    },
  }}
/>

<MobileMoreSheet
  open={moreOpen}
  title={t('nav.more')}
  groups={moreGroups}
  {pathname}
  closeLabel={t('common.cancel')}
  onClose={() => {
    moreOpen = false
  }}
/>
