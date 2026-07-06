<script>
  import { toastState, dismissToast } from '$lib/ui.svelte.js';
</script>

<div
  class="toast"
  class:show={toastState.show}
  class:toast--error={toastState.error}
  role={toastState.error ? 'alert' : 'status'}
  aria-live={toastState.error ? 'assertive' : 'polite'}
>
  <span class="toast-msg">{toastState.msg}</span>
  {#if toastState.show}
    <button class="toast-dismiss" type="button" aria-label="关闭" onclick={dismissToast}>×</button>
  {/if}
</div>

<style>
  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    text-align: left;
    pointer-events: none;
  }

  .toast.show {
    pointer-events: auto;
  }

  .toast-msg {
    flex: 1;
    min-width: 0;
  }

  .toast-dismiss {
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    margin: -0.15rem -0.25rem 0 0;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: inherit;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.72;
  }

  .toast-dismiss:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
</style>
