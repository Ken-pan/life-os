<script>
  import { page } from '$app/state';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { buildPrimaryNavItems, resolveNavTab, isNavChromeHidden } from '$lib/nav.js';

  /** @type {{ hidden?: boolean }} */
  let { hidden = false } = $props()

  const items = $derived(buildPrimaryNavItems());
  const current = $derived(resolveNavTab(page.url.pathname));
  const navHidden = $derived(hidden || isNavChromeHidden(page.url.pathname));
</script>

{#if !navHidden}
<nav class="nav" aria-label="主导航">
  <div class="nav-inner">
    {#each items as item (item.tab)}
      <a
        class="nav-item"
        class:on={current === item.tab}
        href={item.href}
        data-sveltekit-noscroll
        aria-current={current === item.tab ? 'page' : undefined}
      >
        <Icon name={item.icon} size={21} strokeWidth={1.5} />
        <span class="nav-lbl" data-ui-decor="nav-label">{item.label}</span>
      </a>
    {/each}
  </div>
</nav>
{/if}
