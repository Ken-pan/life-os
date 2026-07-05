<script>
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '$lib/components/Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  const items = $derived([
    {
      href: '/library',
      icon: 'library',
      title: t('discover.libraryTitle'),
      desc: t('discover.libraryDesc')
    },
    {
      href: '/discover/records',
      icon: 'clipboard',
      title: t('discover.recordsTitle'),
      desc: t('discover.recordsDesc')
    },
    {
      href: '/discover/tools',
      icon: 'chart',
      title: t('discover.toolsTitle'),
      desc: t('discover.toolsDesc')
    },
    {
      href: '/discover/stats',
      icon: 'trend',
      title: t('discover.statsTitle'),
      desc: t('discover.statsDesc')
    }
  ]);
</script>

<section class="view">
  <div class="wrap">
    <p class="lib-intro" use:reveal>{t('discover.intro')}</p>

    <div class="discover-grid">
      {#each items as item (item.href)}
        <a class="discover-card" href={item.href} use:reveal>
          <span class="dc-icon"><Icon name={item.icon} size={20} strokeWidth={1.5} /></span>
          <span class="dc-body">
            <span class="dc-title">{item.title}</span>
            <span class="dc-desc">{item.desc}</span>
          </span>
          <Icon name="chevron-right" size={14} class="dc-chev" />
        </a>
      {/each}
    </div>
  </div>
</section>
