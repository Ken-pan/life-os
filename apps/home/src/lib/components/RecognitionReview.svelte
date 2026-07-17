<script>
  // 跨扫描认亲「证据式确认」卡片(P3)。Mac 精修认出「这次扫到的这件」可能和
  // 以前扫过的某件是同一件,但不够确信 —— 摆出新旧两张裁剪图让用户看图裁决:
  // 是同一件 / 不是 / 暂不确定。数据与回写在 $lib/recognition-review.js(有契约)。
  // 战略:不把不确定性用文字甩给用户,给证据 + 「暂不确定」出口。
  import { resolveRecognition } from '$lib/recognition-review.js'
  import { toast } from '$lib/ui.svelte.js'

  /**
   * @type {{
   *   reviews: import('$lib/recognition-review.js').RecognitionReview[],
   *   onClose: () => void,
   *   onResolved?: () => void,
   * }}
   */
  let { reviews, onClose, onResolved } = $props()

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
      <strong>这几件可能是家里已有的</strong>
      <span>Mac 精修认出下面 {items.length} 件像以前扫过的某件 —— 看图确认，拿不准可以「暂不确定」</span>
    </header>

    <div class="rr-body">
      {#each items as r (keyOf(r))}
        <article class="card" class:dim={busyKey === keyOf(r)}>
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
              {#if r.candidate.score != null}
                <span class="vs-score">{pct(r.candidate.score)}</span>
              {/if}
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

          <div class="actions">
            <button
              type="button"
              class="btn-yes"
              disabled={!!busyKey}
              onclick={() => decide(r, 'same')}
            >
              是同一件
            </button>
            <button
              type="button"
              class="btn-no"
              disabled={!!busyKey}
              onclick={() => decide(r, 'different')}
            >
              不是
            </button>
            <button
              type="button"
              class="btn-maybe"
              disabled={!!busyKey}
              onclick={() => decide(r, 'unsure')}
            >
              暂不确定
            </button>
          </div>
        </article>
      {/each}
    </div>

    <footer class="rr-foot">
      <span class="rr-hint">「是同一件」把这次的观察并进历史身份;「不是」保持独立;「暂不确定」先放着。</span>
      <button type="button" class="btn-ghost" disabled={!!busyKey} onclick={onClose}>关闭</button>
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
    box-shadow: 0 18px 48px color-mix(in srgb, #000 28%, transparent);
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
    font-size: 14px;
    color: var(--t1);
  }

  .rr-head span {
    font-size: 12px;
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

  .card {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    background: var(--bg);
    transition: opacity 0.15s;
  }

  .card.dim {
    opacity: 0.5;
  }

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
    font-size: 11px;
    color: var(--t2);
  }

  .shot figcaption {
    font-size: 11.5px;
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
    background: color-mix(in srgb, var(--graph-accent, #4f7c66) 16%, var(--bg));
    color: var(--t1);
    font-weight: 700;
    font-size: 14px;
  }

  .vs-score {
    font-size: 10.5px;
    color: var(--t2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .actions button {
    flex: 1;
    min-height: 38px;
    font-size: 13px;
    font-weight: 600;
    border-radius: 10px;
    border: 1px solid var(--border);
    cursor: pointer;
  }

  .btn-yes {
    border-color: color-mix(in srgb, var(--graph-accent, #4f7c66) 55%, var(--border));
    background: color-mix(in srgb, var(--graph-accent, #4f7c66) 20%, var(--bg));
    color: var(--t1);
  }

  .btn-no {
    background: var(--bg);
    color: var(--t1);
  }

  .btn-maybe {
    background: var(--bg);
    color: var(--t2);
  }

  .actions button:disabled {
    opacity: 0.55;
    cursor: progress;
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
    font-size: 11px;
    color: var(--t2);
    line-height: 1.3;
    min-width: 0;
  }

  .btn-ghost {
    flex-shrink: 0;
    font-size: 13px;
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .btn-ghost:disabled {
    opacity: 0.6;
    cursor: progress;
  }
</style>
