<script>
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ href: string, label?: string, class?: string }} */
  let { href, label, class: className = '' } = $props();

  const backLabel = $derived(label ?? t('common.back'));
</script>

<a class="back-btn {className}" {href}>
  <Icon name="chevron-left" size={13} strokeWidth={2.5} />
  <span class="back-label">{backLabel}</span>
</a>
