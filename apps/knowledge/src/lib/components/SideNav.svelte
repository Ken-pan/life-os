<script>
  // 桌面侧栏：品牌头 + 分组导航（收集 / 知识库 / 工作空间），无模式切换。
  import { page } from '$app/state'
  import LifeOsSideNav from '@life-os/platform-web/svelte/navigation/side-nav'
  import NotebookText from '@lucide/svelte/icons/notebook-text'
  import { navGroups } from '$lib/nav.js'
  import { t } from '$lib/i18n/index.js'

  const isActive = (href) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)

  const groups = $derived(
    navGroups(t).map((group) => ({
      label: group.label,
      items: group.items.map((item) => ({ ...item, active: isActive(item.href) })),
    })),
  )
  const footItem = $derived({
    href: '/settings',
    icon: 'settings',
    label: t('nav.settings'),
    active: isActive('/settings'),
  })
</script>

<LifeOsSideNav {groups} {footItem} ariaLabel={t('nav.mainAria')}>
  {#snippet brand()}
    <div class="kn-top">
      <a class="kn-brand" href="/library" aria-label={t('app.name')}>
        <span class="kn-mark"><NotebookText size={17} strokeWidth={2} /></span>
        <span class="kn-word">KnowledgeOS</span>
      </a>
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
    background: var(--sidebar-primary, var(--accent));
    color: var(--sidebar, var(--on-accent));
    flex: 0 0 auto;
  }
  .kn-word {
    font-size: var(--text-lg, 15px);
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--sidebar-foreground, var(--t1, var(--text)));
  }
</style>
