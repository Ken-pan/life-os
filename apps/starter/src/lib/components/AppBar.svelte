<script>
  import { t } from '$lib/i18n/index.js'

  /** @type {{ title?: string, hidden?: boolean }} */
  let { title, hidden = false } = $props()
</script>

{#if !hidden}
  <header class="appbar">
    <div class="appbar-inner">
      <div class="appbar-leading">
        <!-- 晋升为正式 app 后换成 <AppBrand appId="…" variant="appbar" />（需先注册品牌） -->
        <span class="page-title">{t('app.name')}</span>
      </div>
      {#if title}
        <div class="appbar-titles">
          <h1 class="page-title">{title}</h1>
        </div>
      {/if}
      <div class="appbar-trailing"></div>
    </div>
  </header>
{/if}
