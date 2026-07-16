<script>
  /**
   * Life OS ErrorState — 错误态（加载失败/同步失败）基座组件。
   * EmptyState 的 error 变体：图标转 --critical，可选重试按钮。
   */
  import EmptyState from './EmptyState.svelte'

  /**
   * @type {{
   *   icon?: string,
   *   iconSize?: number,
   *   title?: string,
   *   description?: string,
   *   retryLabel?: string,
   *   onRetry?: () => void,
   *   media?: import('svelte').Snippet,
   *   children?: import('svelte').Snippet,
   *   actions?: import('svelte').Snippet
   * }}
   */
  let {
    icon = '',
    iconSize = 48,
    title = '',
    description = '',
    retryLabel = '',
    onRetry,
    media,
    children,
    actions: actionsProp,
  } = $props()

  const showRetry = $derived(!actionsProp && Boolean(onRetry) && Boolean(retryLabel))
</script>

{#if showRetry}
  <EmptyState error {icon} {iconSize} {title} {description} {media} {children}>
    {#snippet actions()}
      <button type="button" class="btn-secondary" onclick={onRetry}>
        {retryLabel}
      </button>
    {/snippet}
  </EmptyState>
{:else}
  <EmptyState
    error
    {icon}
    {iconSize}
    {title}
    {description}
    {media}
    {children}
    actions={actionsProp}
  />
{/if}
