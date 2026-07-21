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
  let {
    title = '',
    domainLabel = '',
    showCompose = false,
  } = $props()
  const resolvedDomainLabel = $derived(domainLabel || t('nav.groupMore'))
</script>

<DomainMusicHeader
  {title}
  domainLabel={resolvedDomainLabel}
  {showCompose}
  composeAriaLabel={t('nav.workout')}
/>
