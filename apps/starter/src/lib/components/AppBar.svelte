<script>
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ title?: string, hidden?: boolean }} */
  let { title, hidden = false } = $props()
</script>

<LifeOsAppBar {title} {hidden}>
  {#snippet leading()}
    <!-- 晋升为正式 app 后换成 <AppBrand appId="…" variant="appbar" />（需先注册品牌） -->
    <span class="page-title">{t('app.name')}</span>
  {/snippet}
</LifeOsAppBar>
