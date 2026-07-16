<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + music 的 IA/More sheet。
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav';
  import MobileMoreSheet from '@life-os/platform-web/svelte/navigation/MobileMoreSheet';
  import {
    buildPrimaryNavItems,
    buildMoreNavGroups,
    resolvePrimaryNavTab,
    isMoreNavActive,
    isNavChromeHidden
  } from '$lib/nav.js';
  import { lockScroll, unlockScroll } from '@life-os/theme';

  let moreOpen = $state(false);

  const pathname = $derived(page.url.pathname);
  const primaryTab = $derived(resolvePrimaryNavTab(pathname));
  const items = $derived(
    buildPrimaryNavItems(t).map((item) => ({
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: primaryTab === item.tab,
    }))
  );
  const moreGroups = $derived(buildMoreNavGroups(t));
  const moreActive = $derived(isMoreNavActive(pathname));
  const hidden = $derived(isNavChromeHidden(pathname));

  $effect(() => {
    pathname;
    moreOpen = false;
  });

  $effect(() => {
    if (moreOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  });
</script>

{#if !hidden}
  <LifeOsBottomNav
    {items}
    ariaLabel={t('nav.mainAria')}
    navClass="bottom-nav"
    backgrounded={moreOpen}
    more={{
      label: t('common.more'),
      active: moreActive,
      open: moreOpen,
      onToggle: () => {
        moreOpen = !moreOpen;
      },
    }}
  />

  <MobileMoreSheet
    open={moreOpen}
    title={t('common.more')}
    groups={moreGroups}
    {pathname}
    closeLabel={t('common.close')}
    onClose={() => {
      moreOpen = false;
    }}
  />
{/if}
