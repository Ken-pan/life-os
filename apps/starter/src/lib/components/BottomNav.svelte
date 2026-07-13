<script>
  import { page } from '$app/state'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'

  const items = $derived([
    { href: '/', icon: 'home', label: t('nav.home') },
    { href: '/settings', icon: 'settings', label: t('nav.settings') },
  ])

  const isActive = (item) =>
    item.href === '/'
      ? page.url.pathname === '/'
      : page.url.pathname.startsWith(item.href)
</script>

<nav class="nav bottom-nav" aria-label={t('nav.mainAria')}>
  <div class="nav-inner">
    {#each items as item (item.href)}
      <a
        class="nav-item"
        class:on={isActive(item)}
        href={item.href}
        data-sveltekit-noscroll
        aria-current={isActive(item) ? 'page' : undefined}
        aria-label={item.label}
      >
        <Icon name={item.icon} size={21} strokeWidth={1.5} />
        <span class="nav-lbl">{item.label}</span>
      </a>
    {/each}
  </div>
</nav>
