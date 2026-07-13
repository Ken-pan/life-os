<script>
  import { page } from '$app/state'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'

  const items = $derived([
    { href: '/', icon: 'home', label: t('nav.home') },
  ])
  const settingsItem = $derived({
    href: '/settings',
    icon: 'settings',
    label: t('nav.settings'),
  })

  const isActive = (item) =>
    item.href === '/'
      ? page.url.pathname === '/'
      : page.url.pathname.startsWith(item.href)
</script>

<aside class="sidebar" aria-label={t('nav.mainAria')}>
  <div class="sidebar-body">
    <div class="nav-group">
      {#each items as item (item.href)}
        <a
          class="nav-item"
          class:active={isActive(item)}
          href={item.href}
          data-sveltekit-noscroll
          aria-current={isActive(item) ? 'page' : undefined}
        >
          <Icon name={item.icon} size={18} strokeWidth={1.75} />
          <span class="nav-lbl">{item.label}</span>
        </a>
      {/each}
    </div>
  </div>

  <a
    class="nav-item sidebar-foot-item"
    class:active={isActive(settingsItem)}
    href={settingsItem.href}
    data-sveltekit-noscroll
    aria-current={isActive(settingsItem) ? 'page' : undefined}
  >
    <Icon name={settingsItem.icon} size={18} strokeWidth={1.75} />
    <span class="nav-lbl">{settingsItem.label}</span>
  </a>
</aside>
