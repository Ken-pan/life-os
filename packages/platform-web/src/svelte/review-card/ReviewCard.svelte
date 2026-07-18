<script>
  // Life OS 「证据式确认卡片」共享外壳(评审范式:机器提议一个不确定配对 → 摆证据 →
  // 确认/拒绝/暂缓 → 可撤销 → 决定落库)。**只管展示与交互形状**,不管证据内容与持久化:
  // - 证据由消费方经 `evidence` snippet 注入(图片对比 / 明细金额 / 任意)。
  // - 决定条复用 ReviewActions(决定集可配、文案消费方传)。
  // 适用「一屏一张离散证据卡」场景(如 Home 认亲弹窗)。内联式评审(证据已在上方、
  // 只需决定条)直接用 ReviewActions 更贴(如 Finance 采购增强块)。
  import './review-card.css'
  import ReviewActions from './ReviewActions.svelte'

  /**
   * @typedef {import('./ReviewActions.svelte').ReviewDecision} ReviewDecision
   * @type {{
   *   evidence: import('svelte').Snippet,
   *   title?: import('svelte').Snippet,
   *   question?: string | null,
   *   decisions?: ReviewDecision[],
   *   onDecide?: (key: string) => void,
   *   decided?: { label: string, tone?: 'confirm' | 'reject' | 'neutral' } | null,
   *   undoLabel?: string | null,
   *   onUndo?: () => void,
   *   note?: { text: string, tone?: 'warn' | 'muted' } | null,
   *   busy?: boolean,
   *   dim?: boolean,
   * }}
   */
  let {
    evidence,
    title,
    question = null,
    decisions = [],
    onDecide,
    decided = null,
    undoLabel = null,
    onUndo,
    note = null,
    busy = false,
    dim = false,
  } = $props()
</script>

<article class="review-card" class:review-card--dim={dim} aria-busy={busy}>
  {#if title}
    <header class="review-card__title">{@render title()}</header>
  {/if}

  <div class="review-card__evidence">{@render evidence()}</div>

  <ReviewActions
    {decisions}
    {onDecide}
    {question}
    {decided}
    {undoLabel}
    {onUndo}
    {note}
    {busy}
  />
</article>
