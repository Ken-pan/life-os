<script>
  // Svelte equivalent of nesting <FinanceProvider><TransactionsProvider><TimelineProvider> from
  // the React store providers. Recreated whenever AuthGate remounts it (keyed by dataEpoch), so
  // each fresh instance re-runs the store factories with the latest `data`.
  import { onMount } from 'svelte'
  import { bindNetworkResume } from '@life-os/platform-web/network-resume'
  import { isDemoMode } from '$lib/demoMode'
  import { createFinanceStore, setFinanceStore } from '$lib/finance.svelte.js'
  import { createTransactionsStore, setTransactionsStore } from '$lib/transactions.svelte.js'
  import { createTimelineStore, setTimelineStore } from '$lib/timeline.svelte.js'

  /** @type {{ data: import('../../types').FinanceData, children?: import('svelte').Snippet }} */
  let { data, children } = $props()

  const financeStore = createFinanceStore(data)
  const transactionsStore = createTransactionsStore()
  const timelineStore = createTimelineStore(financeStore, transactionsStore)

  setFinanceStore(financeStore)
  setTransactionsStore(transactionsStore)
  setTimelineStore(timelineStore)

  // 前台恢复时独立重拉交易与断言：扩展同步常常在另一张标签（或原生壳外的浏览器）
  // 里落库新交易，而 loadFinanceData 不含 transactions，AuthGate 的签名比对不会 bump
  // dataEpoch，此 Provider 不会重挂 → 交易 store 不会重建。没有这条钩子，切回本页时
  // 新同步的交易永远不会自动出现。（账户/现金流类同步走 dataEpoch 重挂，已覆盖。）
  //
  // 节流：切回前台可能连发多次 visibilitychange/pageshow，全量交易拉取代价不小，
  // 与 AuthGate 侧带冷却的 bidirectional sync 对齐，避免频繁切标签时刷屏式重拉。
  const RESUME_RELOAD_COOLDOWN_MS = 4000
  let lastResumeReloadAt = 0

  onMount(() => {
    // demo 模式无云端：reloadAssertions/loadTransactions 会直接打 Supabase 报错，跳过绑定。
    if (isDemoMode()) return
    return bindNetworkResume({
      onResume: () => {
        const now = Date.now()
        if (now - lastResumeReloadAt < RESUME_RELOAD_COOLDOWN_MS) return
        lastResumeReloadAt = now
        // reload() 自吞错误（写入 store.error）；reloadAssertions() 会 re-throw，需兜住。
        void transactionsStore.reload()
        timelineStore.reloadAssertions().catch((e) => {
          console.warn('[finance] 前台恢复刷新余额锚点失败：', e)
        })
      },
    })
  })
</script>

{@render children?.()}
