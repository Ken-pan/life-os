<script>
  import Icon from '../icon/Icon.svelte'

  /** @type {{ href: string; label?: string; class?: string; resolveLabel?: () => string }} */
  let { href, label, class: className = '', resolveLabel = () => '' } = $props()

  const backLabel = $derived(label ?? resolveLabel())
</script>

<a class="back-btn {className}" {href}>
  <Icon name="chevron-left" size={13} strokeWidth={2.5} />
  <span class="back-label">{backLabel}</span>
</a>
