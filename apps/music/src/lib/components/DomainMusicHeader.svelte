<script>
  import { resolve } from '$app/paths'
  import DomainMusicHeader from '@life-os/platform-web/svelte/domain-header'
  import { t } from '$lib/i18n/index.js'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   *   backHref?: string,
   *   backLabel?: string,
   * }}
   */
  let {
    title = '',
    domainLabel = 'Music',
    showCompose = false,
    backHref = '',
    backLabel = '',
  } = $props()

  const resolvedBack = $derived(
    backHref
      ? resolve(/** @type {import('$app/types').Pathname} */ (backHref))
      : '',
  )
</script>

<DomainMusicHeader
  {title}
  {domainLabel}
  {showCompose}
  backHref={resolvedBack}
  backLabel={backLabel || t('common.back')}
  composeAriaLabel={t('import.title')}
  quickSwitchLabel={t('nav.quickSwitch')}
/>
