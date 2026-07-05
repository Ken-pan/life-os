<script>
  import { page } from '$app/state';
  import { t } from '$lib/i18n/index.js';
  import Icon from '$lib/components/Icon.svelte';
  import { buildNavItems, resolveNavTab, isNavChromeHidden } from '$lib/nav.js';

  const items = $derived(buildNavItems(t));
  const current = $derived(resolveNavTab(page.url.pathname));
  const hidden = $derived(isNavChromeHidden(page.url.pathname));
</script>

{#if !hidden}
<nav class="nav" aria-label={t('nav.mainAria')}>
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
