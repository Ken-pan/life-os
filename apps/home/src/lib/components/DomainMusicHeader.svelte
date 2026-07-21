<script>
  import DomainMusicHeader from '@life-os/platform-web/svelte/domain-header'

  /**
   * @type {{
   *   title?: string,
   *   domainLabel?: string,
   *   showCompose?: boolean,
   * }}
   */
  let { title = '', domainLabel = 'Home', showCompose = false } = $props()
</script>

<DomainMusicHeader
  {title}
  {domainLabel}
  {showCompose}
  composeAriaLabel="整理"
  quickSwitchLabel="快速切换"
/>
