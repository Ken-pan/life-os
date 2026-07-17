<script>
  // 桌面侧栏：顶部品牌头 + 真·tab（下划线）切「笔记 / 知识」，下方只显当前模式的导航项。
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import { LifeOsTabs } from '@life-os/platform-web/svelte/tabs'
  import NotebookText from '@lucide/svelte/icons/notebook-text'
  import { modeForPath, navItems, homeForMode } from '$lib/nav.js'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const mode = $derived(modeForPath(page.url.pathname))

  const tabs = $derived([
    { id: 'note', label: t('nav.modeNote') },
    { id: 'knowledge', label: t('nav.modeKnowledge') },
  ])
  const groups = $derived([
    {
      items: navItems(mode, t).map((item) => ({ ...item, active: isActive(item.href) })),
    },
  ])
  const footItem = $derived({
    href: '/settings',
    icon: 'settings',
    label: t('nav.settings'),
    active: isActive('/settings'),
  })

  function switchMode(next) {
    if (next !== mode) goto(homeForMode(next))
  }
</script>

<LifeOsSideNav {groups} {footItem} ariaLabel={t('nav.mainAria')}>
  {#snippet brand()}
    <div class="kn-top">
      <a class="kn-brand" href="/library" aria-label={t('app.name')}>
        <span class="kn-mark"><NotebookText size={17} strokeWidth={2} /></span>
        <span class="kn-word">KnowledgeOS</span>
      </a>
      <div class="kn-tabs">
        <LifeOsTabs
          items={tabs}
          activeId={mode}
          onChange={switchMode}
          ariaLabel={t('nav.modeAria')}
          scrollFadeBg="var(--sidebar)"
        />
      </div>
    </div>
  {/snippet}
</LifeOsSideNav>

<style>
  .kn-top {
    display: grid;
    gap: var(--space-3, 12px);
    padding: var(--space-2, 8px) var(--space-1, 4px) var(--space-1, 4px);
  }
  .kn-brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    text-decoration: none;
    padding-inline: var(--space-1, 4px);
  }
  .kn-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    /* 侧栏是 inverse surface：品牌色与图标都走 sidebar token，别继承页面 --accent/--on-accent */
    background: var(--sidebar-primary, var(--accent));
    color: var(--sidebar, var(--on-accent));
    flex: 0 0 auto;
  }
  .kn-word {
    font-size: var(--text-lg, 15px);
    font-weight: 700;
    letter-spacing: -0.01em;
    /* 侧栏前景（亮色模式下侧栏仍为深色，必须用 inverse 前景，否则黑字落深底看不见） */
    color: var(--sidebar-foreground, var(--t1, var(--text)));
  }
  /* 真·tab 撑满侧栏、两段等分 */
  .kn-tabs :global(.tabs) {
    display: flex;
    width: 100%;
    gap: 0;
  }
  .kn-tabs :global(.tab) {
    flex: 1;
    text-align: center;
    /* 侧栏 inverse：tab 文字/下划线走 sidebar token，别用页面 --t3/--accent（亮色下会黑字落深底） */
    color: var(--sidebar-muted, var(--t3, var(--text-muted)));
  }
  .kn-tabs :global(.tab:hover:not(:disabled)) {
    color: var(--sidebar-foreground, var(--t1, var(--text)));
  }
  .kn-tabs :global(.tab[aria-selected='true']),
  .kn-tabs :global(.tab[aria-selected='true']::after) {
    color: var(--sidebar-primary, var(--accent));
  }
  .kn-tabs :global(.tab[aria-selected='true']::after) {
    background: var(--sidebar-primary, var(--accent));
  }
</style>
