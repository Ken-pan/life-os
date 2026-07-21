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
    domainLabel = 'Plan',
    showCompose = false,
    showListsMenu = false,
    showBack = false,
  } = $props()
</script>

<DomainMusicHeader
  {title}
  {domainLabel}
  {showCompose}
  {showListsMenu}
  {showBack}
  composeAriaLabel={t('common.addTask')}
  listsMenuAriaLabel={t('nav.openLists')}
  onListsMenu={openTaskDrawer}
  backLabel={t('common.back')}
  quickSwitchLabel={t('nav.quickSwitch')}
/>
