<script>
  // 整理页:动线与利用率(纯几何,总是可算)+ 分步整理计划(勾了就记住)。
  // 数据来自当前户型 —— 扫描拉取后自动跟着变。
  import { applyLayoutProposal, getActiveProject, isTidyTaskDone, setTidyTaskDone, clearTidyProgress } from '$lib/state.svelte.js'
  import { analyzeCirculation, CLEARANCE } from '$lib/spatial/circulation.js'
  import { solveAllProfiles } from '$lib/spatial/layout-solve.js'
  import { buildTidyPlan, EFFORT_LABEL } from '$lib/spatial/tidy-plan.js'
  import { scoreClutter } from '$lib/spatial/clutter-score.js'
  import { assessPhotoCoverage, COVERAGE_ACTION } from '$lib/spatial/photo-coverage.js'
  import { getPhotoBlob } from '$lib/photo-store.js'
  import { ICONS } from '$lib/iconRegistry.js'

  /** @type {number|null} 今天有多少时间(分钟);null = 不限 */
  let budgetMin = $state(null)
  /** @type {'light'|'medium'|'heavy'|null} 今天有多少力气;null = 不限 */
  let effortCap = $state(null)

  const TIME_OPTS = [
    { v: 15, label: '15 分钟' },
    { v: 30, label: '30 分钟' },
    { v: 60, label: '1 小时' },
    { v: null, label: '不限' },
  ]
  const EFFORT_OPTS = [
    { v: 'light', label: '只想轻的' },
    { v: 'medium', label: '中等' },
    { v: null, label: '不限' },
  ]

  const project = $derived(getActiveProject())
  const circ = $derived(analyzeCirculation(project))
  const clutter = $derived(scoreClutter(project, circ))
  /** 页面打开那一刻的时钟就够了 —— 过期判断按天算,不需要逐秒刷新 */
  const nowMs = Date.now()
  const coverage = $derived(assessPhotoCoverage(project, { now: nowMs }))
  const plan = $derived(
    buildTidyPlan(project, circ, { minutes: budgetMin, effort: effortCap }),
  )
  const doneCount = $derived(plan.tasks.filter((t) => isTidyTaskDone(t.id)).length)
  const remainMinutes = $derived(
    plan.tasks.filter((t) => !isTidyTaskDone(t.id)).reduce((s, t) => s + t.estMinutes, 0),
  )

  /** @type {Record<string, string>} */
  let photoUrls = $state({})

  /** 任务卡上的「整理前」缩略图:按需从 IndexedDB 取 */
  $effect(() => {
    for (const t of plan.tasks) {
      if (!t.photoRef || photoUrls[t.photoRef]) continue
      const ref = t.photoRef
      getPhotoBlob(ref).then((blob) => {
        if (blob) photoUrls = { ...photoUrls, [ref]: URL.createObjectURL(blob) }
      })
    }
  })

  /** @param {number} min */
  function dur(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h ? `${h} 小时 ${m ? `${m} 分` : ''}` : `${m} 分钟`
  }

  /** @param {number} ratio */
  function pct(ratio) {
    return `${Math.round(ratio * 100)}%`
  }

  const KIND_TAGS = {
    blockedDoor: { zh: '通行', cls: 'tag-urgent' },
    bottleneck: { zh: '动线', cls: 'tag-urgent' },
    overflow: { zh: '堆满', cls: 'tag-warn' },
    messy: { zh: '杂乱', cls: 'tag-warn' },
    storage: { zh: '储物', cls: 'tag-info' },
    rescan: { zh: '复扫', cls: 'tag-info' },
  }

  // ---- 布局方案(能力14:约束求解,几何裁决) ----
  /** @type {Awaited<ReturnType<typeof solveAllProfiles>> | null} */
  let proposals = $state(null)
  let solving = $state(false)
  let solveProgress = $state('')
  let solveError = $state('')

  const PROFILE_COUNT = 3

  async function runSolver() {
    if (solving) return
    solving = true
    solveError = ''
    proposals = null
    try {
      // 分块异步:每 16 次迭代让出事件循环 —— 真实户型一套要几秒,
      // 同步跑会把整个页面(和被节流的定时器)一起冻住
      proposals = await solveAllProfiles(getActiveProject(), {
        iterations: 160,
        seed: 42,
        yieldFn: () => new Promise((r) => setTimeout(r)),
        onProgress: (pi, frac) => {
          solveProgress = `${Math.round(((pi + frac) / PROFILE_COUNT) * 100)}%`
        },
      })
    } catch (e) {
      solveError = e instanceof Error ? e.message : String(e)
    } finally {
      solving = false
      solveProgress = ''
    }
  }

  /** @param {any} prop */
  function applyProposal(prop) {
    applyLayoutProposal(prop.moves, prop.profile.nameZh)
    proposals = null // 布局变了,旧方案作废 —— 想再看重新算
  }

  /** @param {any} prop 方案的前后对比人话 */
  function proposalDelta(prop) {
    const parts = []
    const { before: b, after: a } = prop
    if (a.blocked < b.blocked) parts.push(`解开 ${b.blocked - a.blocked} 道堵住的门`)
    if (a.minWidthIn > b.minWidthIn) parts.push(`最窄通道 ${b.minWidthIn}→${a.minWidthIn} in`)
    else if (a.bottlenecks < b.bottlenecks) parts.push(`瓶颈 ${b.bottlenecks}→${a.bottlenecks} 处`)
    if (Math.round(a.tight * 100) < Math.round(b.tight * 100))
      parts.push(`紧张通道 ${pct(b.tight)}→${pct(a.tight)}`)
    if (a.wallFt > b.wallFt) parts.push(`可用贴墙 ${b.wallFt}→${a.wallFt} ft`)
    if (a.freeSqft > b.freeSqft + 1) parts.push(`可活动 +${Math.round(a.freeSqft - b.freeSqft)} sqft`)
    // 摆放逻辑(伴随对间距 + 该贴墙的贴墙):罚分英寸,降 = 更合理
    if (a.affinityIn < b.affinityIn - 2)
      parts.push(`摆放更合理(配对/贴墙 ${b.affinityIn}→${a.affinityIn} in 偏差)`)
    return parts.length ? parts.join(' · ') : '与现状指标接近'
  }
</script>

<svelte:head><title>整理 · HOME.OS</title></svelte:head>

<div class="tidy-page">
  {#if coverage.needs.length}
    <section class="block">
      <h2 class="block-title">
        拍照任务
        <span class="shoot-count">{coverage.needs.length}</span>
      </h2>
      <ul class="shoot-list">
        {#each coverage.needs as n (n.zoneId)}
          <li class="shoot-row">
            <span class="shoot-dot" class:dot-blind={n.status === 'missing' || n.status === 'noPhoto'}></span>
            <div class="shoot-body">
              <span class="shoot-name">{n.nameZh}</span>
              <span class="shoot-why">{n.reason}</span>
            </div>
            <a class="shoot-go" href={`/plan?shoot=${encodeURIComponent(n.zoneId)}`}>
              {COVERAGE_ACTION[n.status]}
            </a>
          </li>
        {/each}
      </ul>
      <p class="block-desc">
        这些分区系统还看不清。点进去平面图会标好站位和朝向 —— 走过去按快门就行,
        识别完杂乱指数和整理计划自动变准。
      </p>
    </section>
  {/if}

  {#if clutter.zones.length}
    <section class="block">
      <h2 class="block-title">杂乱指数</h2>
      <ul class="clutter-list">
        {#each clutter.zones as z (z.zoneId)}
          <li class="clutter-row" class:clutter-worst={z.zoneId === clutter.worst?.zoneId && z.score >= 40}>
            <span class="clutter-score" class:score-high={z.score >= 60} class:score-mid={z.score >= 35 && z.score < 60}>
              {z.score}
            </span>
            <div class="clutter-body">
              <span class="clutter-name">
                {z.nameZh}
                {#if !z.described}<span class="clutter-blind" title="这一区还没做照片识别,分数只含几何指标">未识别</span>{/if}
              </span>
              <span class="clutter-why">
                {z.parts.filter((p) => p.score > 2).map((p) => p.detail).join(' · ') || '状态良好'}
              </span>
            </div>
          </li>
        {/each}
      </ul>
      <p class="block-desc">
        分数由可解释指标合成:家具占地 + 通道紧张 + 动线受阻 + 照片识别的现场状态,不是模型凭感觉。
      </p>
    </section>
  {/if}

  <section class="block">
    <h2 class="block-title">空间利用率</h2>
    {#if !circ.ok}
      <p class="empty">{circ.reason}</p>
    {:else}
      <div class="totals">
        <div class="stat">
          <span class="stat-num">{circ.totals.areaSqft}</span>
          <span class="stat-label">总面积 sqft</span>
        </div>
        <div class="stat">
          <span class="stat-num">{pct(circ.totals.usedRatio)}</span>
          <span class="stat-label">家具占地</span>
        </div>
        <div class="stat">
          <span class="stat-num">{circ.totals.freeSqft}</span>
          <span class="stat-label">可活动 sqft</span>
        </div>
      </div>
      <ul class="zone-list">
        {#each circ.zoneStats as z (z.zoneId)}
          <li class="zone-row">
            <span class="zone-name">{z.nameZh}</span>
            <div class="bar" title="家具占 {pct(z.usedRatio)}">
              <div class="bar-fill" style="width: {pct(z.usedRatio)}"></div>
            </div>
            <span class="zone-num">{z.areaSqft} sqft · 占 {pct(z.usedRatio)}</span>
          </li>
        {/each}
      </ul>
      <p class="block-desc">
        家具占地率超过 60% 的区域通常已经转不开身;窄处占比高说明得侧身走。
      </p>
    {/if}
  </section>

  {#if circ.ok && (circ.bottlenecks.length || circ.blockedDoors.length || circ.isolatedZones.length)}
    <section class="block">
      <h2 class="block-title">动线问题</h2>
      <ul class="issue-list">
        {#each circ.blockedDoors as d (d.id)}
          <li class="issue issue-urgent">🚪 有一道门{d.reason}</li>
        {/each}
        {#each circ.isolatedZones as z (z.zoneId)}
          <li class="issue issue-urgent">🧱 {z.nameZh}从主通道走不进去</li>
        {/each}
        {#each circ.bottlenecks as b (b.zoneId ?? b.x)}
          <li class="issue" class:issue-urgent={b.widthIn < CLEARANCE.minimum}>
            ↔️ {b.nameZh ?? '通道'}最窄处只有 {b.widthIn} 英寸
            <span class="issue-hint">
              (舒适 {CLEARANCE.comfortable} · 单人 {CLEARANCE.tight})
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if circ.ok}
    <section class="block">
      <div class="plan-head">
        <h2 class="block-title">布局方案</h2>
        <button type="button" class="solve-btn" onclick={runSolver} disabled={solving}>
          {solving ? `计算中 ${solveProgress}` : proposals ? '重新计算' : '算三套方案'}
        </button>
      </div>
      {#if solveError}
        <p class="proposal-none">求解失败:{solveError}</p>
      {/if}
      {#if !proposals && !solving && !solveError}
        <p class="block-desc">
          用现有家具求解更好的摆法(几何引擎裁决:不重叠、不堵门、动线只许更好)。
          三个目标:最少折腾 / 最佳动线 / 最大收纳。
        </p>
      {/if}
      {#if proposals}
        <div class="proposal-grid">
          {#each proposals as prop (prop.profile.key)}
            <article class="proposal" class:proposal-idle={!prop.ok}>
              <header class="proposal-head">
                <b>{prop.profile.nameZh}</b>
                <span class="proposal-desc">{prop.profile.desc}</span>
              </header>
              {#if !prop.ok}
                <p class="proposal-none">{prop.reason}</p>
              {:else if prop.duplicateOfZh}
                <p class="proposal-none">与「{prop.duplicateOfZh}」方案完全相同</p>
              {:else}
                <p class="proposal-delta">{proposalDelta(prop)}</p>
                <ul class="move-list">
                  {#each prop.moves as mv (mv.id)}
                    <li class="move-row">
                      <span class="move-name">{mv.label}</span>
                      <span class="move-how">
                        {mv.directionZh}挪 {mv.movedFt} ft{#if mv.rotated}
                          · 转 90°{/if}{#if mv.withZh}
                          · 跟着{mv.withZh}{/if}{#if mv.heavy}
                          · <b class="move-heavy">建议两人</b>{/if}
                      </span>
                    </li>
                  {/each}
                </ul>
                <button type="button" class="apply-btn" onclick={() => applyProposal(prop)}>
                  应用此方案({prop.moves.length} 件,可撤销)
                </button>
              {/if}
            </article>
          {/each}
        </div>
        <p class="block-desc">
          应用后家具位置立即更新(平面页可一步撤销);搬完实物后重扫一次,
          跨扫描身份会把「真挪了」确认下来。
        </p>
      {/if}
    </section>
  {/if}

  <section class="block">
    <div class="plan-head">
      <h2 class="block-title">整理计划</h2>
      {#if plan.tasks.length}
        <span class="plan-sum">
          {doneCount}/{plan.tasks.length} 完成 · 剩 {dur(remainMinutes)}
        </span>
      {/if}
    </div>

    {#if plan.allCount}
      <div class="budget">
        <span class="budget-label">今天有</span>
        {#each TIME_OPTS as o (o.label)}
          <button
            type="button"
            class="chip"
            class:chip-on={budgetMin === o.v}
            onclick={() => (budgetMin = o.v)}>{o.label}</button
          >
        {/each}
        <span class="budget-label budget-gap">力气</span>
        {#each EFFORT_OPTS as o (o.label)}
          <button
            type="button"
            class="chip"
            class:chip-on={effortCap === o.v}
            onclick={() => (effortCap = o.v)}>{o.label}</button
          >
        {/each}
      </div>
    {/if}

    {#if !plan.tasks.length}
      <p class="empty">{plan.summary}</p>
    {:else}
      {#if plan.needsVlm}
        <p class="block-desc hint">
          还没认过房间状态 —— 目前只有几何类任务。去<a href="/plan">平面图</a>给机位照片跑一遍识别,
          就能按「哪里堆满了、堆的是什么」给出针对性步骤。
        </p>
      {/if}
      <ul class="task-list">
        {#each plan.tasks as t (t.id)}
          {@const done = isTidyTaskDone(t.id)}
          <li class="task" class:task-done={done}>
            <label class="task-head">
              <input
                type="checkbox"
                checked={done}
                onchange={(e) => setTidyTaskDone(t.id, e.currentTarget.checked)}
              />
              <span class="task-title">{t.title}</span>
              {#if KIND_TAGS[t.kind]}
                <span class="tag {KIND_TAGS[t.kind].cls}">{KIND_TAGS[t.kind].zh}</span>
              {/if}
              <span class="task-min">{EFFORT_LABEL[t.effort]} · {t.estMinutes} 分</span>
            </label>
            <p class="task-reason">{t.reason}</p>
            <div class="task-body">
              <ol class="steps">
                {#each t.steps as s}<li>{s}</li>{/each}
              </ol>
              {#if t.photoRef && photoUrls[t.photoRef]}
                <figure class="before">
                  <img src={photoUrls[t.photoRef]} alt="整理前" />
                  <figcaption>整理前</figcaption>
                </figure>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      {#if doneCount}
        <button type="button" class="btn-secondary reset" onclick={clearTidyProgress}>
          重置勾选
        </button>
      {/if}
    {/if}
  </section>
</div>

<style>
  .shoot-count {
    display: inline-block;
    min-width: 20px;
    padding: 0 6px;
    margin-left: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, #b45309 16%, var(--bg));
    color: #b45309;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    vertical-align: 2px;
  }

  .shoot-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .shoot-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .shoot-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #b45309;
  }

  .shoot-dot.dot-blind {
    background: #dc2626;
  }

  .shoot-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shoot-name {
    font-weight: 600;
    font-size: 14px;
  }

  .shoot-why {
    font-size: 12.5px;
    color: var(--t2);
  }

  .shoot-go {
    flex: none;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg2, var(--bg));
    color: var(--t1, inherit);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .shoot-go:active {
    transform: scale(0.97);
  }

  .clutter-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .clutter-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .clutter-worst {
    border-color: color-mix(in srgb, #b45309 45%, var(--border));
  }

  .clutter-score {
    min-width: 44px;
    text-align: center;
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--t2);
  }

  .clutter-score.score-mid {
    color: #b45309;
  }

  .clutter-score.score-high {
    color: #dc2626;
  }

  .clutter-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .clutter-name {
    font-size: 14px;
    font-weight: 650;
    color: var(--t1);
  }

  .clutter-blind {
    margin-left: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--t2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    cursor: help;
  }

  .clutter-why {
    font-size: 12px;
    color: var(--t2);
  }

  .tidy-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    max-width: 900px;
    margin: 0 auto;
  }

  .block {
    background: var(--surface, rgba(128, 128, 128, 0.06));
    border: 1px solid var(--line, rgba(128, 128, 128, 0.2));
    border-radius: 12px;
    padding: 14px 16px;
  }

  .block-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--t2);
    margin: 0 0 12px;
    text-transform: uppercase;
  }

  .block-desc {
    font-size: 12px;
    color: var(--t3, var(--t2));
    margin: 10px 0 0;
    line-height: 1.5;
  }

  .hint {
    color: var(--t2);
  }

  .empty {
    font-size: 13px;
    color: var(--t2);
    margin: 0;
  }

  .totals {
    display: flex;
    gap: 24px;
    margin-bottom: 14px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-num {
    font-size: 22px;
    font-weight: 700;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 11px;
    color: var(--t3, var(--t2));
  }

  .zone-list,
  .issue-list,
  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zone-row {
    display: grid;
    grid-template-columns: 5.5em 1fr auto;
    align-items: center;
    gap: 10px;
  }

  .zone-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar {
    height: 8px;
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.2);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent, #4a7ba7);
  }

  .zone-num {
    font-size: 11px;
    color: var(--t3, var(--t2));
    font-variant-numeric: tabular-nums;
  }

  .issue {
    font-size: 13px;
    color: var(--t1);
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(180, 83, 9, 0.1);
  }

  .issue-urgent {
    background: rgba(163, 52, 31, 0.12);
  }

  .issue-hint {
    font-size: 11px;
    color: var(--t3, var(--t2));
  }

  .plan-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .solve-btn,
  .apply-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 12px;
    color: var(--t1);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }

  .solve-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .solve-btn:hover:not(:disabled),
  .apply-btn:hover {
    border-color: var(--tidy-accent, var(--t2));
  }

  .proposal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    margin: 10px 0 8px;
  }

  .proposal {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .proposal-idle {
    opacity: 0.75;
  }

  .proposal-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .proposal-desc {
    font-size: 11px;
    color: var(--t3);
  }

  .proposal-none {
    margin: 0;
    font-size: 12px;
    color: var(--t3);
  }

  .proposal-delta {
    margin: 0;
    font-size: 12px;
    color: var(--t2);
  }

  .move-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .move-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
  }

  .move-name {
    font-weight: 600;
  }

  .move-how {
    color: var(--t3);
    text-align: right;
  }

  .move-heavy {
    color: var(--warn, #c46a3f);
    font-weight: 600;
  }

  .apply-btn {
    margin-top: auto;
    align-self: flex-start;
  }

  .plan-sum {
    font-size: 12px;
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }

  .budget {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 12px;
  }

  .budget-label {
    font-size: 12px;
    color: var(--t3, var(--t2));
  }

  .budget-gap {
    margin-left: 8px;
  }

  .chip {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--line, rgba(128, 128, 128, 0.3));
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }

  .chip-on {
    background: var(--accent, #4a7ba7);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
  }

  .task {
    border: 1px solid var(--line, rgba(128, 128, 128, 0.2));
    border-radius: 10px;
    padding: 10px 12px;
  }

  .task-done {
    opacity: 0.5;
  }

  .task-done .task-title {
    text-decoration: line-through;
  }

  .task-head {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .task-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--t1);
    flex: 1;
  }

  .task-min {
    font-size: 11px;
    color: var(--t3, var(--t2));
    font-variant-numeric: tabular-nums;
  }

  .tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .tag-urgent {
    background: rgba(163, 52, 31, 0.15);
    color: #a3341f;
  }

  .tag-warn {
    background: rgba(180, 83, 9, 0.15);
    color: #b45309;
  }

  .tag-info {
    background: rgba(92, 117, 140, 0.15);
    color: #5c758c;
  }

  .task-reason {
    font-size: 12px;
    color: var(--t2);
    margin: 6px 0 0 26px;
  }

  .task-body {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 8px 0 0 26px;
  }

  .steps {
    flex: 1;
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--t2);
    line-height: 1.7;
  }

  .before {
    margin: 0;
    flex-shrink: 0;
  }

  .before img {
    width: 84px;
    height: 112px;
    object-fit: cover;
    border-radius: 6px;
  }

  .before figcaption {
    font-size: 10px;
    color: var(--t3, var(--t2));
    text-align: center;
    margin-top: 2px;
  }

  .reset {
    margin-top: 12px;
  }

  @media (max-width: 600px) {
    .totals {
      gap: 16px;
    }

    .task-body {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .before img {
      width: 100%;
      height: 140px;
    }
  }
</style>
