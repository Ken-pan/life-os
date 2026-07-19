<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import FocusSessionShell from '$lib/components/FocusSessionShell.svelte'
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'
  import { FOCUS, hydrateFocusStore } from '$lib/kenos/focusStore.svelte.js'
  import { CONTROL, refreshControlCenter } from '$lib/kenos/controlCenter.svelte.js'

  const productionActive = $derived(
    (CONTROL.focusContexts || []).filter((item) =>
      ['active', 'paused', 'temporarily_left'].includes(item.status),
    ),
  )

  onMount(() => {
    hydrateFocusStore()
    void refreshControlCenter()
    if (!FOCUS.focus && productionActive.length === 0) {
      // Keep local empty navigation; production empty is not an error.
    }
    if (!FOCUS.focus && CONTROL.sources.focus.status === 'unsupported') {
      /* local-only path */
    }
  })
</script>

<div class="focus-page">
  <ReadSourceState
    state={CONTROL.sources.focus}
    onRetry={() => refreshControlCenter({ force: true })}
  />

  {#if FOCUS.focus}
    <p class="focus-source-note" role="note">本机 Focus 会话（设备本地状态，不是跨设备生产同步）。</p>
    <FocusSessionShell />
  {:else if productionActive.length}
    <div class="focus-empty">
      <p>生产 Focus 有 {productionActive.length} 个会话投影；本机尚未开始设备会话。</p>
      <p class="focus-source-note">写入生产 Focus 尚未开启。可从 Spaces 开启本机会话。</p>
      <a href="/spaces">前往 Spaces</a>
    </div>
  {:else}
    <div class="focus-empty">
      <p>当前没有 Focus Session。</p>
      <p class="focus-source-note">
        {#if CONTROL.sources.focus.status === 'empty'}
          生产侧也没有活跃会话。
        {:else if CONTROL.sources.focus.status === 'unsupported'}
          生产 Focus 读取默认关闭；上方状态不是「零条」。
        {/if}
      </p>
      <a href="/spaces">前往 Spaces</a>
      <button type="button" class="focus-linkish" onclick={() => goto('/spaces')}>返回</button>
    </div>
  {/if}
</div>

<style>
  .focus-page {
    width: min(100% - 32px, 720px);
    margin: 24px auto 48px;
    display: grid;
    gap: 12px;
  }
  .focus-empty {
    width: min(100%, 640px);
  }
  .focus-source-note {
    margin: 0;
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .focus-linkish {
    display: none;
  }
</style>
