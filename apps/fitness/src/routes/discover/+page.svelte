<script>
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '@life-os/platform-web/svelte/icon';
  import { t } from '$lib/i18n/index.js';

  const learnItems = $derived([
    {
      href: '/library',
      icon: 'library',
      title: t('discover.libraryTitle'),
      desc: t('discover.libraryDesc')
    },
    {
      href: '/discover/tools',
      icon: 'chart',
      title: t('discover.toolsTitle'),
      desc: t('discover.toolsDesc')
    }
  ]);

  const dataItems = $derived([
    {
      href: '/discover/records',
      icon: 'clipboard',
      title: t('discover.recordsTitle'),
      desc: t('discover.recordsDesc')
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

    <div class="discover-section" use:reveal>
      <h2 class="discover-section-title">{t('discover.sectionLearn')}</h2>
      <div class="discover-grid">
        {#each learnItems as item (item.href)}
          <a class="discover-card" href={item.href}>
            <span class="dc-icon"><Icon name={item.icon} size={18} strokeWidth={1.5} /></span>
            <span class="dc-body">
              <span class="dc-title">{item.title}</span>
              <span class="dc-desc">{item.desc}</span>
            </span>
            <Icon name="chevron-right" size={14} class="dc-chev" />
          </a>
        {/each}
      </div>
    </div>

    <div class="discover-section" use:reveal>
      <h2 class="discover-section-title">{t('discover.sectionMine')}</h2>
      <div class="discover-grid">
        {#each dataItems as item (item.href)}
          <a class="discover-card" href={item.href}>
            <span class="dc-icon"><Icon name={item.icon} size={18} strokeWidth={1.5} /></span>
            <span class="dc-body">
              <span class="dc-title">{item.title}</span>
              <span class="dc-desc">{item.desc}</span>
            </span>
            <Icon name="chevron-right" size={14} class="dc-chev" />
          </a>
        {/each}
      </div>
    </div>
  </div>
</section>
