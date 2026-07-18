<script>
  // 证据式确认的「决定条」—— 评审范式里可复用的**交互部分**:确认/拒绝/暂缓 →
  // 已决态 + 撤销 → 状态注记。不含证据、不含卡片外框,方便挂在任意证据下面
  // (Home 的图片对比卡内、Finance 的采购增强块内)。文案全由消费方传,自身无业务文字。
  import './review-card.css'

  /**
   * @typedef {{ key: string, label: string, tone?: 'confirm' | 'reject' | 'neutral' }} ReviewDecision
   * @type {{
   *   decisions?: ReviewDecision[],
   *   onDecide?: (key: string) => void,
   *   question?: string | null,
   *   decided?: { label: string, tone?: 'confirm' | 'reject' | 'neutral' } | null,
   *   undoLabel?: string | null,
   *   onUndo?: () => void,
   *   note?: { text: string, tone?: 'warn' | 'muted' } | null,
   *   busy?: boolean,
   * }}
   */
  let {
    decisions = [],
    onDecide,
    question = null,
    decided = null,
    undoLabel = null,
    onUndo,
    note = null,
    busy = false,
  } = $props()
</script>

{#if decided}
  <div class="review-card__decided">
    <span class="review-card__badge" data-tone={decided.tone ?? 'confirm'}>{decided.label}</span>
    {#if undoLabel && onUndo}
      <button type="button" class="review-card__btn review-card__btn--undo" disabled={busy} onclick={onUndo}>
        {undoLabel}
      </button>
    {/if}
  </div>
{:else if decisions.length}
  {#if question}
    <p class="review-card__q">{question}</p>
  {/if}
  <div class="review-card__actions">
    {#each decisions as d (d.key)}
      <button
        type="button"
        class="review-card__btn review-card__btn--{d.tone ?? 'neutral'}"
        disabled={busy}
        onclick={() => onDecide?.(d.key)}
      >{d.label}</button>
    {/each}
  </div>
{/if}

{#if note}
  <p class="review-card__note" data-tone={note.tone ?? 'muted'} role="status">{note.text}</p>
{/if}
