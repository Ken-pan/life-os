<script>
  import LifeOsAppBar from '@life-os/platform-web/svelte/app-bar'
  import Plus from '@lucide/svelte/icons/plus'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ title?: string, hidden?: boolean, onNew?: () => void }} */
  let { title, hidden = false, onNew } = $props()
</script>

<LifeOsAppBar {title} {hidden}>
  {#snippet leading()}
    <!-- 晋升为正式 app 后换成 <AppBrand appId="…" variant="appbar" />（需先注册品牌） -->
    <span class="page-title">{t('app.name')}</span>
  {/snippet}
  {#snippet trailing()}
    {#if onNew}
      <button type="button" class="appbar-new" onclick={onNew}>
        <Plus size={16} strokeWidth={2.4} />
        <span>{t('common.newNote')}</span>
      </button>
    {/if}
  {/snippet}
</LifeOsAppBar>

<style>
  .appbar-new {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 var(--space-3, 12px);
    border: none;
    border-radius: var(--radius-pill, 999px);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: filter var(--motion-fast) var(--ease), transform var(--motion-fast) var(--ease);
  }
  .appbar-new:hover { filter: brightness(1.08); }
  .appbar-new:active { transform: scale(0.97); }
  @media (max-width: 640px) {
    .appbar-new span { display: none; }
    .appbar-new { padding: 0; width: 32px; justify-content: center; }
  }
</style>
