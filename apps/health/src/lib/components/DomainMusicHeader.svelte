<script>
  import DomainMusicHeader from '@life-os/platform-web/svelte/domain-header'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   * }}
   */
  let { title = '', domainLabel = 'Health', showCompose = false } = $props()
</script>

<DomainMusicHeader
  {title}
  {domainLabel}
  {showCompose}
  composeAriaLabel={t('focus.title')}
  quickSwitchLabel={t('nav.quickSwitch')}
/>
