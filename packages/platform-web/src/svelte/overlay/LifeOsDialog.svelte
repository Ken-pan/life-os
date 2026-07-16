<script>
  /**
   * Life OS Dialog — 居中对话框行为组件。
   * 外观由 @life-os/theme 的 .modal-bg / .modal（modal.css）提供；
   * 本组件只负责行为：入场过渡（.show 下一帧挂载）、backdrop 关闭、Escape、
   * focus trap、背景滚动锁、dialog/alertdialog ARIA。
   * 领域内容（如 Fitness 重量 stepper）经 children/actions snippet 注入。
   */
  import { tick } from 'svelte'
  import { activateFocusTrap, lockScroll, unlockScroll } from '@life-os/theme'

  /**
   * @type {{
   *   open?: boolean,
   *   title?: string,
   *   subtitle?: string,
   *   onClose?: () => void,
   *   closeOnBackdrop?: boolean,
   *   manageFocus?: boolean,
   *   lockBackgroundScroll?: boolean,
   *   destructive?: boolean,
   *   ariaLabel?: string,
   *   dialogClass?: string,
   *   header?: import('svelte').Snippet,
   *   children?: import('svelte').Snippet,
   *   actions?: import('svelte').Snippet
   * }}
   */
  let {
    open = false,
    title = '',
    subtitle = '',
    onClose,
    closeOnBackdrop = true,
    manageFocus = true,
    lockBackgroundScroll = true,
    destructive = false,
    ariaLabel = '',
    dialogClass = '',
    header,
    children,
    actions,
  } = $props()

  const uid = $props.id()
  const titleId = `${uid}-dialog-title`

  /** @type {HTMLDivElement | null} */
  let dialogEl = $state(null)
  let shown = $state(false)

  /** @param {MouseEvent} e */
  function onBackdrop(e) {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
  }

  $effect(() => {
    if (!open) {
      shown = false
      return
    }
    /** @type {(() => void) | null} */
    let releaseFocus = null
    let cancelled = false
    // .show 下一帧再挂，让 modal.css 的 opacity/transform 过渡能播放
    const raf = requestAnimationFrame(() => {
      shown = true
    })

    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const lockedScroll = lockBackgroundScroll
    if (lockedScroll) lockScroll()

    tick().then(() => {
      if (cancelled || !dialogEl || !manageFocus) return
      releaseFocus = activateFocusTrap(dialogEl)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      releaseFocus?.()
      if (lockedScroll) unlockScroll()
    }
  })
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-bg" class:show={shown} onclick={onBackdrop}>
    <div
      bind:this={dialogEl}
      class="modal {dialogClass}"
      role={destructive ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title && ariaLabel ? ariaLabel : undefined}
    >
      {#if header}
        {@render header()}
      {:else}
        {#if title}
          <h2 class="modal-title" id={titleId}>{title}</h2>
        {/if}
        {#if subtitle}
          <p class="modal-sub">{subtitle}</p>
        {/if}
      {/if}
      {@render children?.()}
      {#if actions}
        <div class="modal-actions">{@render actions()}</div>
      {/if}
    </div>
  </div>
{/if}
