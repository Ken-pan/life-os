<script>
  // /plan 顶部的「认亲确认」横幅(P3)—— Mac 精修认出这次扫描里有几件像以前扫过的
  // 某件,但不够确信。第一眼就温和提示,点开是证据卡片(RecognitionReview)。
  // 战略:主动把难例交给用户,但可忽略、不催 —— 忽略后压下,下次精修出**新**难例才再冒泡。
  import { auth } from '$lib/auth.svelte.js'
  import { loadRecognitionReviews } from '$lib/recognition-review.js'
  import RecognitionReview from './RecognitionReview.svelte'

  const SEEN_KEY = 'homeos_recognition_seen_v1'

  /** @type {import('$lib/recognition-review.js').RecognitionReview[]} */
  let reviews = $state([])
  /** 全部待确认总数(reviews 只是本批 ≤5) */
  let total = $state(0)
  let open = $state(false)
  let dismissed = $state(false)

  /** @param {import('$lib/recognition-review.js').RecognitionReview} r */
  const keyOf = (r) => `${r.scanId}:${r.observationId}`

  $effect(() => {
    if (!auth.user) {
      reviews = []
      total = 0
      return
    }
    let alive = true
    loadRecognitionReviews()
      .then((batch) => {
        if (!alive) return
        reviews = batch.items
        total = batch.total
        // 本批难例全都忽略过 → 不再冒泡(下次 Mac 精修出新 key 会重新出现)
        const seen = seenSet()
        dismissed = batch.items.length > 0 && batch.items.every((r) => seen.has(keyOf(r)))
      })
      .catch(() => {}) // 网络/权限问题不打扰画图
    return () => {
      alive = false
    }
  })

  function seenSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'))
    } catch {
      return new Set()
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(reviews.map(keyOf)))
    } catch {
      /* 隐私模式禁 localStorage:退化成本会话内忽略 */
    }
    dismissed = true
  }

  function reload() {
    loadRecognitionReviews()
      .then((batch) => {
        reviews = batch.items
        total = batch.total
      })
      .catch(() => {})
  }
</script>

{#if open}
  <RecognitionReview {reviews} onClose={() => (open = false)} onResolved={reload} />
{/if}

{#if reviews.length && !dismissed}
  <div class="recog-banner" role="note">
    <div class="recog-copy">
      <strong>{reviews.length} 件待确认{total > reviews.length ? `（共 ${total} 处）` : ''}</strong>
      <span>Mac 精修认出这些像以前扫过的某件 —— 先给你最像的几件，确认完自动浮出下一批；拿不准可以「暂不确定」。</span>
    </div>
    <div class="recog-actions">
      <button type="button" class="recog-cta" onclick={() => (open = true)}>看看</button>
      <button
        type="button"
        class="recog-dismiss"
        onclick={dismiss}
        aria-label="忽略认亲提示"
      >
        忽略
      </button>
    </div>
  </div>
{/if}

<style>
  .recog-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 8px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--graph-accent, var(--accent)) 45%, var(--border));
    background: color-mix(in srgb, var(--graph-accent, var(--accent)) 8%, var(--card));
  }

  .recog-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .recog-copy strong {
    font-size: var(--text-md);
    color: var(--t1);
  }

  .recog-copy span {
    font-size: var(--text-sm);
    color: var(--t2);
  }

  .recog-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .recog-cta {
    font-size: var(--text-md);
    font-weight: 650;
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--graph-accent, var(--accent)) 55%, var(--border));
    background: color-mix(in srgb, var(--graph-accent, var(--accent)) 18%, var(--bg));
    color: var(--t1);
    cursor: pointer;
  }

  .recog-dismiss {
    font-size: var(--text-sm);
    min-height: 36px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }
</style>
