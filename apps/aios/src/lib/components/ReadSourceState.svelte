<script>
  import { PRODUCT_COPY } from '$lib/kenos/productStates.core.js'

  /** @type {{ state: import('$lib/kenos/readProjections.core.js').sourceState, onRetry?: () => void }} */
  let { state, onRetry = undefined } = $props()

  const label = $derived({
    loading: '正在同步',
    ready: '已更新',
    empty: '暂无内容',
    partial: '部分内容暂不可用',
    stale: '显示的是已保存内容',
    offline: '当前离线',
    unavailable: '暂未连接',
    permission_denied: PRODUCT_COPY.permissionDenied.title,
    unsupported: '暂未连接',
    error: '暂时无法更新',
  }[state?.status] ?? '状态未知')

  /** Hide quiet ready/empty noise on dense surfaces (Today already owns UX). */
  const quiet = $derived(
    state?.status === 'ready' || state?.status === 'empty',
  )
</script>

{#if !quiet}
  <div
    class="read-source-state read-source-state--{state?.status ?? 'unknown'}"
    class:read-source-state--banner={state?.status === 'permission_denied'}
    role={state?.status === 'loading' ? 'status' : undefined}
    aria-live="polite"
  >
    <div>
      <span class="read-source-state__label">{label}</span>
      {#if state?.lastUpdated && state?.status !== 'permission_denied'}
        <time datetime={state.lastUpdated}>
          上次更新于 {new Intl.DateTimeFormat('zh-CN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(state.lastUpdated))}
        </time>
      {/if}
    </div>
    {#if state?.status === 'permission_denied'}
      <p>{PRODUCT_COPY.permissionDenied.body}</p>
    {:else if state?.status === 'loading'}
      <p>正在同步…</p>
    {:else if state?.message}
      <p>{state.message}</p>
    {/if}
    {#if state?.status === 'permission_denied'}
      <a class="read-source-state__action" href="/settings#cloud"
        >{PRODUCT_COPY.permissionDenied.action}</a
      >
    {:else if state?.retryable && onRetry}
      <button type="button" onclick={onRetry}>重试</button>
    {/if}
  </div>
{/if}

<style>
  .read-source-state {
    display: grid;
    gap: 6px;
    margin: 22px 0 0;
    padding: 12px 0 12px 14px;
    border-left: 2px solid var(--border-l);
    color: var(--t3);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .read-source-state--ready,
  .read-source-state--empty {
    border-left-color: var(--positive);
  }
  .read-source-state--partial,
  .read-source-state--stale,
  .read-source-state--unavailable,
  .read-source-state--unsupported {
    border-left-color: var(--warning);
  }
  .read-source-state--offline,
  .read-source-state--error {
    border-left-color: var(--critical);
  }
  .read-source-state--banner,
  .read-source-state--permission_denied {
    border-left: 0;
    padding: 14px;
    border-radius: var(--kenos-radius-group, 12px);
    background: var(--kenos-surface-group, var(--card));
    border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  }
  .read-source-state > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .read-source-state__label {
    color: var(--t1);
    font-weight: 650;
  }
  .read-source-state time {
    font-variant-numeric: tabular-nums;
  }
  .read-source-state p {
    margin: 0;
    max-width: 680px;
  }
  .read-source-state button,
  .read-source-state__action {
    justify-self: start;
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid var(--border-l);
    border-radius: 8px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
