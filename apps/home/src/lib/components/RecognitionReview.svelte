<script>
  // 跨扫描认亲「证据式确认」卡片(P3)。Mac 精修认出「这次扫到的这件」可能和
  // 以前扫过的某件是同一件,但不够确信 —— 摆出新旧两张裁剪图让用户看图裁决:
  // 是同一件 / 不是 / 暂不确定。数据与回写在 $lib/recognition-review.js(有契约)。
  // 战略:不把不确定性用文字甩给用户,给证据 + 「暂不确定」出口。
  import { resolveRecognition } from '$lib/recognition-review.js'
  import { toast } from '$lib/ui.svelte.js'
  import { ReviewCard } from '@life-os/platform-web/svelte/review-card'

  /**
   * @type {{
   *   reviews: import('$lib/recognition-review.js').RecognitionReview[],
   *   onClose: () => void,
   *   onResolved?: () => void,
   * }}
   */
  let { reviews, onClose, onResolved } = $props()

  /** 三态裁决(证据卡片外壳的决定条配置)。文案在这、外壳只管展示。 */
  const DECISIONS = [
    { key: 'same', label: '是同一件', tone: 'confirm' },
    { key: 'different', label: '不是', tone: 'reject' },
    { key: 'unsure', label: '暂不确定', tone: 'neutral' },
  ]

  /** @param {import('$lib/recognition-review.js').RecognitionReview} r */
  const keyOf = (r) => `${r.scanId}:${r.observationId}`

  /** 已裁决的 key(本地即时移除,不等父组件 refetch)。 */
  let decided = $state(new Set())
  let busyKey = $state('')

  /** 待处理队列 = 传入的 reviews 去掉本地已裁决的。 */
  const items = $derived(reviews.filter((r) => !decided.has(keyOf(r))))

  /** @param {number | undefined} s */
  const pct = (s) => (s == null ? '' : `${Math.round(s * 100)}% 像`)

  /**
   * 这张卡片的证据完整度 → 一句提醒。照片缺失时别让用户盲判,把「暂不确定」抬成合理出口。
   * @param {import('$lib/recognition-review.js').RecognitionReview} r
   * @returns {{ text: string, tone: 'warn' | 'muted' } | null}
   */
  function evidenceNote(r) {
    const hasNew = !!r.newCropUrl
    const hasOld = !!r.candidate.oldCropUrl
    if (!hasNew && !hasOld)
      return { text: '两侧都没有可比对的照片 —— 拿不准就选「暂不确定」。', tone: 'warn' }
    if (!hasNew || !hasOld)
      return { text: '只有一侧有照片，对比有限，可结合名称与相似度判断。', tone: 'muted' }
    return null
  }

  /**
   * @param {import('$lib/recognition-review.js').RecognitionReview} review
   * @param {import('$lib/recognition-review.js').RecognitionDecision} decision
   */
  async function decide(review, decision) {
    const k = keyOf(review)
    if (busyKey) return
    busyKey = k
    try {
      await resolveRecognition(review, decision)
      decided = new Set(decided).add(k)
      onResolved?.()
      if (!items.length) onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      busyKey = ''
    }
  }
</script>

<div
  class="rr-backdrop"
  role="presentation"
  onclick={(e) => e.target === e.currentTarget && !busyKey && onClose()}
>
  <div class="rr-panel" role="dialog" aria-modal="true" aria-label="确认跨扫描认亲">
    <header class="rr-head">
      {#if items.length}
        <strong>这几件可能是家里已有的</strong>
        <span>Mac 精修认出下面 {items.length} 件像以前扫过的某件 —— 看图确认，拿不准可以「暂不确定」</span>
      {:else}
        <strong>这批都确认完了</strong>
        <span>没有更多待认亲的重复件了。</span>
      {/if}
    </header>

    <div class="rr-body">
      {#if !items.length}
        <div class="rr-empty" role="status">
          <span class="rr-empty-mark" aria-hidden="true">✓</span>
          <p class="rr-empty-title">这批没有更多了</p>
          <span class="rr-empty-sub">Mac 下次精修再认出新的重复件，会重新提醒你。</span>
        </div>
      {/if}
      {#each items as r (keyOf(r))}
        <ReviewCard
          decisions={DECISIONS}
          onDecide={(key) => decide(r, key)}
          busy={!!busyKey}
          dim={busyKey === keyOf(r)}
          note={evidenceNote(r)}
        >
          {#snippet evidence()}
            <div class="pair">
              <figure class="shot">
                {#if r.newCropUrl}
                  <img src={r.newCropUrl} alt="这次扫到的 {r.label ?? r.kind ?? '物体'}" />
                {:else}
                  <div class="noimg">无缩略图</div>
                {/if}
                <figcaption>这次扫到<br /><b>{r.label ?? r.kind ?? '未命名'}</b></figcaption>
              </figure>

              <div class="vs">
                <span class="vs-q">?</span>
                <span class="vs-score" class:vs-score--unknown={r.candidate.score == null}>
                  {r.candidate.score != null ? pct(r.candidate.score) : '相似度未知'}
                </span>
              </div>

              <figure class="shot">
                {#if r.candidate.oldCropUrl}
                  <img src={r.candidate.oldCropUrl} alt="以前的 {r.candidate.label ?? '物体'}" />
                {:else}
                  <div class="noimg">无历史图</div>
                {/if}
                <figcaption>以前的<br /><b>{r.candidate.label ?? '历史身份'}</b></figcaption>
              </figure>
            </div>
          {/snippet}
        </ReviewCard>
      {/each}
    </div>

    <footer class="rr-foot">
      <span class="rr-hint">
        {items.length
          ? '「是同一件」把这次的观察并进历史身份;「不是」保持独立;「暂不确定」先放着。'
          : ''}
      </span>
      <button type="button" class="rr-close" disabled={!!busyKey} onclick={onClose}>关闭</button>
    </footer>
  </div>
</div>

<style>
  .rr-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(2px);
  }

  .rr-panel {
    display: flex;
    flex-direction: column;
    width: min(480px, 100%);
    max-height: min(82vh, 680px);
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: 0 18px 48px color-mix(in srgb, black 28%, transparent);
    overflow: hidden;
  }

  .rr-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
  }

  .rr-head strong {
    font-size: var(--text-base);
    color: var(--t1);
  }

  .rr-head span {
    font-size: var(--text-sm);
    color: var(--t2);
  }

  .rr-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* 卡片外壳 + 决定条移到共享 ReviewCard(@life-os/platform-web/svelte/review-card);
     这里只留证据(新旧图对比)自己的样式。 */
  .pair {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 10px;
  }

  .shot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }

  .shot img,
  .shot .noimg {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--t2) 8%, transparent);
  }

  .shot .noimg {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    color: var(--t2);
  }

  .shot figcaption {
    font-size: var(--text-xs);
    line-height: 1.3;
    color: var(--t2);
    text-align: center;
  }

  .shot figcaption b {
    color: var(--t1);
    font-weight: 650;
  }

  .vs {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .vs-q {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--graph-accent, var(--accent)) 16%, var(--bg));
    color: var(--t1);
    font-weight: 700;
    font-size: var(--text-base);
  }

  .vs-score {
    font-size: var(--text-mobile-tab);
    color: var(--t2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: center;
  }

  .vs-score--unknown {
    font-style: italic;
    opacity: 0.85;
  }

  .rr-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 16px 24px;
    text-align: center;
  }

  .rr-empty-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--graph-accent, var(--accent)) 16%, var(--bg));
    color: var(--graph-accent, var(--accent));
    font-size: var(--text-base);
    font-weight: 700;
  }

  .rr-empty-title {
    margin: 2px 0 0;
    font-size: var(--text-md);
    font-weight: 650;
    color: var(--t1);
  }

  .rr-empty-sub {
    font-size: var(--text-sm);
    color: var(--t2);
    line-height: 1.4;
    max-width: 34ch;
  }

  .rr-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 16px 14px;
    border-top: 1px solid var(--border);
  }

  .rr-hint {
    font-size: var(--text-xs);
    color: var(--t2);
    line-height: 1.3;
    min-width: 0;
  }

  .rr-close {
    flex-shrink: 0;
    font-size: var(--text-md);
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .rr-close:disabled {
    opacity: 0.6;
    cursor: progress;
  }
</style>
