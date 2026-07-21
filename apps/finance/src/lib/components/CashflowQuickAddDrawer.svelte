<script>
  // Port of src/components/CashflowQuickAddDrawer.tsx.
  import { onMount } from 'svelte'
  import { getFinanceStore, uid } from '$lib/finance.svelte.js'
  import { signedMonthOffset } from '../../engine/calendar.js'
  import DateField from './fields/DateField.svelte'
  import NumberField from './fields/NumberField.svelte'
  import TextField from './fields/TextField.svelte'
  import {
    clearMoneyOverlay,
    setMoneyOverlay,
  } from '$lib/kenos/financeSpaceAdapter.js'

  onMount(() => {
    setMoneyOverlay('drawer')
    return () => clearMoneyOverlay()
  })

  /** @type {{ onClose: () => void }} */
  let { onClose } = $props()

  const store = getFinanceStore()

  /** @typedef {'income' | 'expense'} Kind */

  /** @type {Kind} */
  let kind = $state('expense')
  let amount = $state(0)
  let name = $state('')

  function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  let date = $state(todayISO())

  /** @param {Kind} k @param {string} d @param {number} amt @param {string} n */
  function makeEvent(k, d, amt, n) {
    const now = new Date()
    return {
      id: uid('evt'),
      name: n.trim() || (k === 'income' ? '一次性收入' : '一次性支出'),
      eventType: k === 'income' ? 'windfall' : 'one-time-purchase',
      enabled: true,
      amount: amt,
      date: d,
      monthOffset: signedMonthOffset(now, d),
      fundingSource: k === 'expense' ? 'checking' : undefined,
    }
  }

  /** @param {SubmitEvent} e */
  function add(e) {
    e.preventDefault()
    if (amount <= 0) return
    store.upsertEvent(makeEvent(kind, date, amount, name))
    onClose()
  }
</script>

<div class="drawer-backdrop kenos-drawer-backdrop" onclick={onClose} role="presentation"></div>
<aside class="drawer kenos-drawer-panel">
  <div class="drawer-head">
    <h2>添加一次性收支</h2>
    <button type="button" class="icon-btn" onclick={onClose}>关闭</button>
  </div>

  <form onsubmit={add}>
    <div class="seg mb-3">
      <button type="button" class={kind === 'expense' ? 'active' : ''} onclick={() => (kind = 'expense')}>
        支出
      </button>
      <button type="button" class={kind === 'income' ? 'active' : ''} onclick={() => (kind = 'income')}>
        收入
      </button>
    </div>

    <NumberField label="金额" value={amount} onChange={(v) => (amount = v)} step={50} min={0} />
    <TextField
      label="名称"
      value={name}
      onChange={(v) => (name = v)}
      placeholder={kind === 'income' ? '如：报税退款 / 奖金' : '如：旅行 / 买设备 / 看病'}
    />
    <DateField label="日期" value={date} onChange={(v) => (date = v || todayISO())} />

    <p class="meta mt-3 mb-0">过去的日期会记为「已发生」，不计入未来预测，只用于记录与对账。</p>

    <button class="btn mt-4 w-full" type="submit" disabled={amount <= 0}>添加</button>
  </form>
</aside>
