<script>
  import DomainMusicHeader from '@life-os/platform-web/svelte/domain-header'
  import { t } from '$lib/i18n.svelte.js'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   *   composeAriaLabel?: string,
   * }}
   */
  let {
    title = '',
    domainLabel = 'Money',
    showCompose = false,
    composeAriaLabel = '',
  } = $props()
</script>

<DomainMusicHeader
  {title}
  {domainLabel}
  {showCompose}
  composeAriaLabel={composeAriaLabel || t('nav.fabLogTxn')}
  quickSwitchLabel={t('nav.quickSwitch')}
/>
