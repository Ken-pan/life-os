<script>
  import { t } from '$lib/i18n/index.js';
  import Icon from './Icon.svelte';

  /** @type {{ message?: string }} */
  let { message = t('common.empty') } = $props();
</script>

<div class="empty">
  <div class="empty-icon">
    <Icon name="sun" size={48} strokeWidth={1.5} />
  </div>
  <p>{message}</p>
</div>
