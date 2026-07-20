<script>
  /**
   * Life OS Sheet — 底部弹层行为组件。
   * 外观由 @life-os/theme 的 .sheet-bg / .sheet / .sheet-handle 提供（components.css）；
   * 本组件只负责行为：backdrop 关闭、Escape、focus trap、背景滚动锁、dialog ARIA。
   * 领域内容（表单、工具面板等）经 children/actions snippet 注入，组件保持 generic、无 app ID。
   */
  import { tick } from 'svelte'
  import { activateFocusTrap, lockScroll, unlockScroll } from '@life-os/theme'

  /**
   * @type {{
   *   open?: boolean,
   *   title?: string,
   *   onClose?: () => void,
   *   closeOnBackdrop?: boolean,
   *   manageFocus?: boolean,
   *   lockBackgroundScroll?: boolean,
   *   showHandle?: boolean,
   *   ariaLabel?: string,
   *   sheetClass?: string,
   *   bgClass?: string,
   *   sheetStyle?: string,
   *   placement?: 'bottom' | 'auto',
   *   header?: import('svelte').Snippet,
   *   children?: import('svelte').Snippet,
   *   actions?: import('svelte').Snippet
   * }}
   */
  let {
    open = false,
    title = '',
    onClose,
    closeOnBackdrop = true,
    manageFocus = true,
    lockBackgroundScroll = true,
    showHandle = true,
    ariaLabel = '',
    sheetClass = '',
    bgClass = '',
    /** Optional inline style on `.sheet` (e.g. desktop anchored panel). */
    sheetStyle = '',
    /** @type {'bottom' | 'auto'} `bottom` = theme default; `auto` = host may restyle via data-placement */
    placement = 'bottom',
    header,
    children,
    actions,
  } = $props()

  const uid = $props.id()
  const titleId = `${uid}-sheet-title`

  /** @type {HTMLDivElement | null} */
  let sheetEl = $state(null)

  /** @param {MouseEvent} e */
  function onBackdrop(e) {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
  }

  $effect(() => {
    if (!open) return
    /** @type {(() => void) | null} */
    let releaseFocus = null
    let cancelled = false

    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const lockedScroll = lockBackgroundScroll
    if (lockedScroll) lockScroll()

    tick().then(() => {
      if (cancelled || !sheetEl || !manageFocus) return
      releaseFocus = activateFocusTrap(sheetEl)
    })

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      releaseFocus?.()
      if (lockedScroll) unlockScroll()
    }
  })
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class={['sheet-bg', bgClass].filter(Boolean).join(' ')}
    data-placement={placement === 'auto' ? 'auto' : undefined}
    onclick={onBackdrop}
  >
    <div
      bind:this={sheetEl}
      class="sheet {sheetClass}"
      style={sheetStyle || undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title && ariaLabel ? ariaLabel : undefined}
    >
      {#if showHandle}
        <div class="sheet-handle" aria-hidden="true"></div>
      {/if}
      {#if header}
        {@render header()}
      {:else if title}
        <h2 class="sheet-title" id={titleId}>{title}</h2>
      {/if}
      {@render children?.()}
      {#if actions}
        <div class="sheet-actions">{@render actions()}</div>
      {/if}
    </div>
  </div>
{/if}
