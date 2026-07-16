<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + fitness 的 IA/active 判定。
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav';
  import { buildNavItems, resolveNavTab, isNavChromeHidden } from '$lib/nav.js';

  const current = $derived(resolveNavTab(page.url.pathname));
  const items = $derived(
    buildNavItems(t).map((item) => ({
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: current === item.tab,
    }))
  );
  const hidden = $derived(isNavChromeHidden(page.url.pathname));
</script>

<LifeOsBottomNav {items} {hidden} ariaLabel={t('nav.mainAria')} labelDecor />
