<script>
  /**
   * Life OS EmptyState — 空态基座组件。
   * 外观由 theme components.css 的 .empty / .empty-icon / .empty-title /
   * .empty-desc / .empty-actions 提供；本组件只负责结构。
   * 图标可用注册表名（icon）或自带 SVG（media snippet）；CTA 走 actions snippet。
   */
  import Icon from '../icon/Icon.svelte'

  /**
   * @type {{
   *   icon?: string,
   *   iconSize?: number,
   *   title?: string,
   *   description?: string,
   *   error?: boolean,
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
    error = false,
    media,
    children,
    actions,
  } = $props()
</script>

<div class="empty" class:empty--error={error}>
  {#if media}
    {@render media()}
  {:else if icon}
    <div class="empty-icon">
      <Icon name={icon} size={iconSize} strokeWidth={1.5} />
    </div>
  {/if}
  {#if title}
    <h3 class="empty-title">{title}</h3>
  {/if}
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {@render children?.()}
  {#if actions}
    <div class="empty-actions">{@render actions()}</div>
  {/if}
</div>
