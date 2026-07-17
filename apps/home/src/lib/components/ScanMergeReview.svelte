<script>
  // 扫描合并「逐项确认」—— 把这次扫描要做的每一处修改摆出来,
  // 用户逐项勾选后才落地。默认全选(勾着 = 接受);拒绝的项:
  // 挪动 → 几何保持本地只收编照片;新增 → 不进项目;替换 → 手录件保留。
  // 纯展示组件:决策语义在 spatial/scan-merge.js 的 decisions 参数,有单测。
  /**
   * @type {{
   *   identity: any,
   *   registration?: any,
   *   busy?: boolean,
   *   onConfirm: (decisions: import('$lib/spatial/scan-merge.js').MergeDecisions) => void,
   *   onCancel: () => void,
   * }}
   */
  let { identity, registration = null, busy = false, onConfirm, onCancel } = $props()

  /** key → true = 用户拒绝该项(缺省接受) */
  let rejected = $state({})

  /** 替换对里的新来件不再单独列「新增」:替换行一次说清双方 */
  const replacedByIds = $derived(new Set((identity?.replaced ?? []).map((r) => r.byId)))
  const moves = $derived(identity?.moved ?? [])
  const adds = $derived((identity?.addedItems ?? []).filter((a) => !replacedByIds.has(a.id)))
  const replaces = $derived(identity?.replaced ?? [])
  const addedById = $derived(
    Object.fromEntries((identity?.addedItems ?? []).map((a) => [a.id, a])),
  )
  const total = $derived(moves.length + adds.length + replaces.length)
  const rejectedCount = $derived(Object.values(rejected).filter(Boolean).length)

  const regLine = $derived.by(() => {
    if (!registration || registration.status !== 'ok') return ''
    return `已对齐户型 · 中位残差 ${registration.medianCm}cm · ${registration.matchedWalls} 段墙`
  })

  function confirm() {
    /** @type {any} */
    const decisions = { moves: {}, adds: {}, replaces: {} }
    for (const m of moves) {
      if (rejected[`mv:${m.prevId}`]) decisions.moves[m.prevId] = false
    }
    for (const a of adds) {
      if (rejected[`add:${a.id}`]) decisions.adds[a.mappedId] = false
    }
    for (const r of replaces) {
      if (rejected[`rep:${r.id}`]) {
        decisions.replaces[r.id] = false
        // 拒绝替换 = 手录件保留;顶它的那件若是本轮新增,一并不进来,
        // 否则同一位置会站两件
        const incoming = addedById[r.byId]
        if (incoming) decisions.adds[incoming.mappedId] = false
      }
    }
    onConfirm(decisions)
  }
</script>

<div class="review-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
  <div class="review-panel" role="dialog" aria-modal="true" aria-label="确认这次扫描的修改">
    <header class="review-head">
      <strong>这次扫描想做 {total} 处修改</strong>
      <span>{regLine || '逐项确认后才会落地,全程可撤销'}</span>
    </header>

    <div class="review-body">
      {#if moves.length}
        <section>
          <h3>挪动({moves.length})</h3>
          {#each moves as m (m.prevId)}
            <label class="row">
              <input
                type="checkbox"
                checked={!rejected[`mv:${m.prevId}`]}
                onchange={(e) => (rejected[`mv:${m.prevId}`] = !e.currentTarget.checked)}
              />
              <span class="row-text">
                <span class="row-main">「{m.label}」挪了 {m.movedFt}ft</span>
                {#if m.wall}
                  <span class="row-sub">墙距佐证:{m.wall.verdict === 'moved' ? '确实换了位置' : '贴墙距离没变,可能是包围盒抖动'}</span>
                {:else}
                  <span class="row-sub">接受 = 更新到实测新位置;拒绝 = 保持原位,只收编照片</span>
                {/if}
              </span>
            </label>
          {/each}
        </section>
      {/if}

      {#if adds.length}
        <section>
          <h3>新发现({adds.length})</h3>
          {#each adds as a (a.id)}
            <label class="row">
              <input
                type="checkbox"
                checked={!rejected[`add:${a.id}`]}
                onchange={(e) => (rejected[`add:${a.id}`] = !e.currentTarget.checked)}
              />
              <span class="row-text">
                <span class="row-main">{a.label || a.kind}</span>
                <span class="row-sub">扫描新认出的一件;拒绝 = 这轮不入册(可能是误检)</span>
              </span>
            </label>
          {/each}
        </section>
      {/if}

      {#if replaces.length}
        <section>
          <h3>替换手录件({replaces.length})</h3>
          {#each replaces as r (r.id)}
            <label class="row">
              <input
                type="checkbox"
                checked={!rejected[`rep:${r.id}`]}
                onchange={(e) => (rejected[`rep:${r.id}`] = !e.currentTarget.checked)}
              />
              <span class="row-text">
                <span class="row-main">「{r.label}」→ 换成实测的「{r.byLabel}」</span>
                <span class="row-sub">拒绝 = 保留手录的这件,实测那件不进来</span>
              </span>
            </label>
          {/each}
        </section>
      {/if}

      {#if identity?.removed?.length || identity?.suppressed?.length || identity?.possiblySame}
        <section class="info">
          <h3>不需要决定的</h3>
          {#if identity.removed.length}
            <p>这轮没扫到(原样保留):{identity.removed.join('、')}</p>
          {/if}
          {#if identity.suppressed?.length}
            <p>已自动拦下的惯性误检:{identity.suppressed.map((s) => `${s.label}(其实是${s.byLabel})`).join('、')}</p>
          {/if}
          {#if identity.possiblySame}
            <p>{identity.possiblySame} 件不敢认(证据不足,保守当新件处理)</p>
          {/if}
          {#if identity.unchanged}
            <p>{identity.unchanged} 件原位确认,照片已更新</p>
          {/if}
        </section>
      {/if}
    </div>

    <footer class="review-foot">
      <button type="button" class="btn-ghost" disabled={busy} onclick={onCancel}>取消</button>
      <button type="button" class="btn-cta" disabled={busy} onclick={confirm}>
        {busy
          ? '应用中…'
          : rejectedCount
            ? `应用 ${total - rejectedCount} 项(拒绝 ${rejectedCount} 项)`
            : `全部应用(${total} 项)`}
      </button>
    </footer>
  </div>
</div>

<style>
  .review-backdrop {
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

  .review-panel {
    display: flex;
    flex-direction: column;
    width: min(480px, 100%);
    max-height: min(78vh, 640px);
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: 0 18px 48px color-mix(in srgb, #000 28%, transparent);
    overflow: hidden;
  }

  .review-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
  }

  .review-head strong {
    font-size: 14px;
    color: var(--t1);
  }

  .review-head span {
    font-size: 12px;
    color: var(--t2);
  }

  .review-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  section h3 {
    margin: 6px 0 4px;
    font-size: 12px;
    font-weight: 650;
    color: var(--t2);
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    cursor: pointer;
  }

  .row:hover {
    background: color-mix(in srgb, var(--graph-accent, #4f7c66) 7%, transparent);
  }

  .row input {
    margin-top: 2px;
    accent-color: var(--graph-accent, #4f7c66);
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .row-main {
    font-size: 13px;
    color: var(--t1);
  }

  .row-sub {
    font-size: 11.5px;
    color: var(--t2);
  }

  .info p {
    margin: 2px 0;
    font-size: 12px;
    color: var(--t2);
  }

  .review-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px 14px;
    border-top: 1px solid var(--border);
  }

  .btn-ghost {
    font-size: 13px;
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--t2);
    cursor: pointer;
  }

  .btn-cta {
    font-size: 13px;
    font-weight: 650;
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--graph-accent, #4f7c66) 55%, var(--border));
    background: color-mix(in srgb, var(--graph-accent, #4f7c66) 18%, var(--bg));
    color: var(--t1);
    cursor: pointer;
  }

  .btn-cta:disabled,
  .btn-ghost:disabled {
    opacity: 0.6;
    cursor: progress;
  }
</style>
