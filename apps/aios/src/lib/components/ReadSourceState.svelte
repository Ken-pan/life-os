<script>
  /** @type {{ state: import('$lib/kenos/readProjections.core.js').sourceState, onRetry?: () => void }} */
  let { state, onRetry = undefined } = $props()

  const label = $derived({
    loading: '读取中',
    ready: '已连接',
    empty: '来源为空',
    partial: '部分可用',
    stale: '数据陈旧',
    offline: '设备离线',
    unavailable: '来源不可用',
    permission_denied: '权限不足',
    unsupported: '尚无 canonical 来源',
  }[state?.status] ?? '来源状态未知')
</script>

<div
  class="read-source-state read-source-state--{state?.status ?? 'unknown'}"
  role={state?.status === 'loading' ? 'status' : undefined}
  aria-live="polite"
>
  <div>
    <span class="read-source-state__label">{label}</span>
    <span class="read-source-state__source">{state?.source ?? 'unknown source'}</span>
    {#if state?.lastUpdated}
      <time datetime={state.lastUpdated}>
        {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.lastUpdated))}
      </time>
    {/if}
  </div>
  {#if state?.message}<p>{state.message}</p>{/if}
  {#if state?.malformedCount || state?.duplicateCount}
    <p>
      {#if state.malformedCount}{state.malformedCount} 项格式降级{/if}
      {#if state.malformedCount && state.duplicateCount} · {/if}
      {#if state.duplicateCount}{state.duplicateCount} 项重复引用已合并{/if}
    </p>
  {/if}
  {#if state?.retryable && onRetry}
    <button type="button" onclick={onRetry}>安全重试读取</button>
  {/if}
</div>

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
  .read-source-state--stale {
    border-left-color: var(--warning);
  }
  .read-source-state--offline,
  .read-source-state--unavailable,
  .read-source-state--permission_denied,
  .read-source-state--unsupported {
    border-left-color: var(--critical);
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
  .read-source-state__source,
  .read-source-state time {
    font-variant-numeric: tabular-nums;
  }
  .read-source-state p {
    margin: 0;
    max-width: 680px;
  }
  .read-source-state button {
    justify-self: start;
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid var(--border-l);
    border-radius: 8px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    cursor: pointer;
  }
</style>
