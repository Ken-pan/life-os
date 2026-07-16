<script>
  // 薄封装：共享 LifeOsBottomNav 骨架 + home 的 IA/active 判定。
  import { page } from '$app/state';
  import LifeOsBottomNav from '@life-os/platform-web/svelte/navigation/bottom-nav';
  import { buildPrimaryNavItems, resolveNavTab, isNavChromeHidden } from '$lib/nav.js';

  /** @type {{ hidden?: boolean }} */
  let { hidden = false } = $props()

  const current = $derived(resolveNavTab(page.url.pathname));
  const items = $derived(
    buildPrimaryNavItems().map((item) => ({
      key: item.tab,
      href: item.href,
      icon: item.icon,
      label: item.label,
      active: current === item.tab,
    }))
  );
  const navHidden = $derived(hidden || isNavChromeHidden(page.url.pathname));
</script>

<LifeOsBottomNav {items} hidden={navHidden} ariaLabel="主导航" labelDecor />
