<script>
  import './toast.css'

  /**
   * Life OS 统一 Toast 组件（superset）：
   * - state：createToastStore() 的 toastState
   * - onDismiss：action 按钮回调后、或 dismiss 按钮点击时调用
   * - dismissLabel：非空时显示 × 关闭按钮（music 形态）；空则不显示
   * 样式类（.toast / .toast-action / .toast-dismiss）在 @life-os/theme components.css。
   */
  let { state, onDismiss, dismissLabel = '' } = $props()

  function handleAction() {
    state.onAction?.()
    onDismiss?.()
  }

  const isAssertive = $derived(state.tone === 'error' || state.tone === 'warn')
</script>

<div
  class="toast toast--{state.tone}"
  class:toast--action={state.actionLabel}
  class:show={state.show}
  role={isAssertive ? 'alert' : 'status'}
  aria-live={isAssertive ? 'assertive' : 'polite'}
  aria-atomic="true"
>
  <span class="toast-msg">{state.msg}</span>
  {#if state.actionLabel && state.onAction}
    <button type="button" class="toast-action" onclick={handleAction}>{state.actionLabel}</button>
  {/if}
  {#if dismissLabel && state.show}
    <button class="toast-dismiss" type="button" aria-label={dismissLabel} onclick={onDismiss}>×</button>
  {/if}
</div>
