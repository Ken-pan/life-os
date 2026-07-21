<script>
  import DomainMusicHeader from '@life-os/platform-web/svelte/domain-header'
  import { openTaskDrawer } from '$lib/ui.svelte.js'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   *   showListsMenu?: boolean,
   *   showBack?: boolean,
   * }}
   */
  let {
    title = '',
    domainLabel = '',
    showCompose = false,
    showListsMenu = false,
    showBack = false,
  } = $props()
  // Product Space name — keep “Plan” in both locales (like Spaces).
  const resolvedDomainLabel = $derived(domainLabel || 'Plan')
</script>

<DomainMusicHeader
  {title}
  domainLabel={resolvedDomainLabel}
  {showCompose}
  {showListsMenu}
  {showBack}
  composeAriaLabel={t('common.addTask')}
  listsMenuAriaLabel={t('nav.openLists')}
  onListsMenu={openTaskDrawer}
  backLabel={t('common.back')}
/>
