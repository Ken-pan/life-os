<script>
  import DomainMusicHeader from '@life-os/platform-web/svelte/domain-header'
  import { t } from '$lib/i18n/index.js'

  /**
   * compact: note detail hides large title (editor has its own back); More stays in overlay bubble.
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   *   compact?: boolean,
   *   composeLabel?: string,
   * }}
   */
  let {
    title = '',
    domainLabel = 'Library',
    showCompose = false,
    compact = false,
    composeLabel = '',
  } = $props()
</script>

<DomainMusicHeader
  {title}
  {domainLabel}
  {showCompose}
  {compact}
  composeAriaLabel={composeLabel || t('common.newNote')}
/>
