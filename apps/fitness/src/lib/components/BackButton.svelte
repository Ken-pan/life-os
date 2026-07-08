<script>
  import BackButton from '@life-os/platform-web/svelte/navigation'
  import { t } from '$lib/i18n/index.js'

  let props = $props()
</script>

<BackButton {...props} resolveLabel={() => t('common.back')} />
