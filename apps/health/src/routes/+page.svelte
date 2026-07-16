<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import { A, act, pollState, refreshDetails } from '$lib/agent.svelte.js'
  import { OBS, logCheckin, logSleep } from '$lib/stateEngine.svelte.js'
  import { deriveState, DIMENSION_ORDER } from '$lib/stateEngine.core.js'

  let nowMs = $state(Date.now())

  onMount(() => {
    const stopPoll = pollState()
    const boot = setTimeout(refreshDetails, 300)
    const details = setInterval(refreshDetails, 15000)
    const clock = setInterval(() => (nowMs = Date.now()), 30000)
    return () => {
      stopPoll()
      clearTimeout(boot)
      clearInterval(details)
      clearInterval(clock)
    }
  })

  /** i18n 模板插值:'{x} 分钟' + {x: 5} */
  const fmt = (key, p) => t(key).replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''))
  const reason = (r) => fmt(r.k, r.p)

  const greeting = $derived.by(() => {
    const h = new Date(nowMs).getHours()
    if (h < 12) return t('now.greetingMorning')
    if (h < 18) return t('now.greetingAfternoon')
    return t('now.greetingEvening')
  })

  const s = $derived(A.state)
  const paused = $derived(Boolean(s?.paused))

  // —— Observe → Understand:把代理观察 + 手动观察喂给 State Engine ——
  const agentInput = $derived.by(() => {
    const dayStart = new Date(nowMs)
    dayStart.setHours(0, 0, 0, 0)
    const t0 = dayStart.getTime() / 1000
    const doneNet = A.sessions
      .filter((r) => r.start >= t0)
      .reduce((sum, r) => sum + (r.peakNetSeconds ?? 0), 0)
    const warnsToday = A.events.filter((e) => e.type === 'warn_shown' && e.ts >= t0).length
    return {
      online: A.online,
      phase: s?.phase ?? 'normal',
      score: s?.score ?? 0,
      limitSeconds: s?.limitSeconds ?? 1200,
      note: s?.note ?? '',
      breaksToday: s?.breaksToday ?? 0,
      todayNetMinutes: (doneNet + (s?.score ?? 0)) / 60,
      warnsToday,
    }
  })

  const engine = $derived(
    deriveState({ now: nowMs, observations: OBS.list, agent: agentInput }),
  )

  const headline = $derived.by(() => {
    if (!A.online && OBS.list.length === 0) return t('now.stateOffline')
    if (paused && engine.headline.k === 'state.h_allGood') return t('now.statePaused')
    return fmt(engine.headline.k, engine.headline.p)
  })

  // —— 状态记录(Raw observation 输入)——
  let selEnergy = $state(3)
  let selStress = $state(3)
  let selSleep = $state(null)
  let savedAt = $state('')
  const SLEEP_CHOICES = [5, 6, 6.5, 7, 7.5, 8, 9]

  function saveCheckin() {
    logCheckin({ energy: selEnergy, stress: selStress })
    if (selSleep != null) logSleep(selSleep)
    const d = new Date()
    savedAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    selSleep = null
    nowMs = Date.now()
  }

  // —— Focus 负荷条(沿用 HLT-1)——
  const netMinutes = $derived(Math.floor((s?.score ?? 0) / 60))
  const limitMinutes = $derived(Math.max(1, Math.floor((s?.limitSeconds ?? 1200) / 60)))
  const frac = $derived(Math.min(1, (s?.score ?? 0) / (s?.limitSeconds || 1200)))
  const meterTone = $derived.by(() => {
    if (!A.online || paused) return 'idle'
    if (s?.phase === 'breaking') return 'break'
    if (s?.phase === 'warning' || frac > 0.85) return 'hot'
    return frac >= 0.05 ? 'active' : 'idle'
  })
</script>

<div class="wrap">
  <header class="hero">
    <p class="greet">{greeting}, Ken</p>
    <h2 class="headline">{headline}</h2>
  </header>

  <!-- 六维状态(Understand 层,每格都能解释来源) -->
  <section class="card">
    <h3>{t('now.dims')}</h3>
    <div class="dims">
      {#each DIMENSION_ORDER as key (key)}
        {@const dim = engine.dims[key]}
        <article class="dim" data-level={dim.level}>
          <header class="dim-head">
            <span class="dim-name">{t(`state.dim_${key}`)}</span>
            <span class="dim-level"><i class="dot"></i>{t(`state.level_${dim.level}`)}</span>
          </header>
          <ul class="dim-reasons">
            {#each dim.reasons.slice(0, 2) as r, i (`${r.k}-${i}`)}
              <li>{reason(r)}</li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  </section>

  <!-- 状态记录(Observe 层,手动数据源) -->
  <section class="card">
    <div class="checkin-head">
      <h3>{t('now.checkin')}</h3>
      <span class="hint">{savedAt ? fmt('now.savedAt', { time: savedAt }) : t('now.checkinHint')}</span>
    </div>
    <div class="checkin-rows">
      <div class="ck-row">
        <span class="ck-label">{t('now.energy')}</span>
        <span class="ck-scale">{t('now.scaleLow')}</span>
        <div class="ck-seg" role="group" aria-label={t('now.energy')}>
          {#each [1, 2, 3, 4, 5] as v (v)}
            <button type="button" class:on={selEnergy === v} aria-pressed={selEnergy === v}
              onclick={() => (selEnergy = v)}>{v}</button>
          {/each}
        </div>
        <span class="ck-scale">{t('now.scaleHigh')}</span>
      </div>
      <div class="ck-row">
        <span class="ck-label">{t('now.stress')}</span>
        <span class="ck-scale">{t('now.scaleLow')}</span>
        <div class="ck-seg" role="group" aria-label={t('now.stress')}>
          {#each [1, 2, 3, 4, 5] as v (v)}
            <button type="button" class:on={selStress === v} aria-pressed={selStress === v}
              onclick={() => (selStress = v)}>{v}</button>
          {/each}
        </div>
        <span class="ck-scale">{t('now.scaleHigh')}</span>
      </div>
      <div class="ck-row">
        <span class="ck-label">{t('now.sleepLastNight')}</span>
        <div class="ck-seg wide" role="group" aria-label={t('now.sleepLastNight')}>
          <button type="button" class:on={selSleep === null} aria-pressed={selSleep === null}
            onclick={() => (selSleep = null)}>{t('now.sleepSkip')}</button>
          {#each SLEEP_CHOICES as h (h)}
            <button type="button" class:on={selSleep === h} aria-pressed={selSleep === h}
              onclick={() => (selSleep = h)}>{h}</button>
          {/each}
          <span class="ck-scale">{t('now.hoursUnit')}</span>
        </div>
      </div>
    </div>
    <div>
      <button class="btn primary" onclick={saveCheckin}>{t('now.saveCheckin')}</button>
    </div>
  </section>

  <!-- Focus 负荷 + 最小行动(Regulate 层) -->
  {#if A.online}
    <section class="card meter-card" data-tone={meterTone}>
      <div class="meter-head">
        <h3>{t('now.focusMeter')}</h3>
        <span class="meter-num">
          <strong>{netMinutes}</strong> / {limitMinutes} {t('now.minutesUnit')}
        </span>
      </div>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax={limitMinutes} aria-valuenow={netMinutes} aria-label={t('now.focusMeter')}>
        <div class="meter-fill" style:width={`${frac * 100}%`}></div>
      </div>
      <dl class="facts">
        <div>
          <dt>{t('now.signalNow')}</dt>
          <dd>{s?.note ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('now.breaksToday')}</dt>
          <dd>{s?.breaksToday ?? 0} {t('now.breaksUnit')}</dd>
        </div>
      </dl>
    </section>

    <section class="card">
      <h3>{t('now.actions')}</h3>
      <div class="actions">
        {#if paused}
          <button class="btn primary" onclick={() => act('resume')}>{t('now.actResume')}</button>
        {:else}
          <button class="btn primary" onclick={() => act('break')}>{t('now.actBreak')}</button>
          <button class="btn" onclick={() => act('pause30')}>{t('now.actPause30')}</button>
          <button class="btn" onclick={() => act('pauseToday')}>{t('now.actPauseToday')}</button>
        {/if}
      </div>
    </section>
  {:else}
    <section class="card">
      <h3>{t('now.agentOffline')}</h3>
      <p class="muted">{t('now.agentOfflineHint')}</p>
      <code class="cmd">{t('now.agentInstallCmd')}</code>
    </section>
  {/if}
</div>

<style>
  .hero {
    margin-block: var(--space-5, 20px) var(--space-4, 16px);
    display: grid;
    gap: var(--space-1, 4px);
  }
  .greet {
    color: var(--t3);
    font-size: 0.875rem;
    letter-spacing: 0.04em;
  }
  .headline {
    font-size: 1.35rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--t1);
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    margin-block-end: var(--space-4, 16px);
    display: grid;
    gap: var(--space-3, 12px);
  }
  .card h3 {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--t3);
  }
  .muted {
    color: var(--t2);
  }
  .cmd {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8125rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    padding: 8px 12px;
    width: fit-content;
  }

  /* —— 六维状态 —— */
  .dims {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: var(--space-3, 12px);
  }
  .dim {
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 12px);
    background: var(--bg-2);
    padding: var(--space-3, 12px) var(--space-4, 14px);
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .dim-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .dim-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--t1);
  }
  .dim-level {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--t2);
    white-space: nowrap;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--t4);
  }
  .dim[data-level='good'] .dot { background: #34d399; }
  .dim[data-level='ok'] .dot { background: var(--accent); }
  .dim[data-level='watch'] .dot { background: #e2a13d; }
  .dim[data-level='bad'] .dot { background: #f87171; }
  .dim[data-level='good'] .dim-level { color: #34d399; }
  .dim[data-level='watch'] .dim-level { color: #e2a13d; }
  .dim[data-level='bad'] .dim-level { color: #f87171; }
  .dim-reasons {
    display: grid;
    gap: 2px;
  }
  .dim-reasons li {
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--t3);
    overflow-wrap: anywhere;
  }

  /* —— 状态记录 —— */
  .checkin-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3, 12px);
  }
  .hint {
    font-size: 0.75rem;
    color: var(--t4);
  }
  .checkin-rows {
    display: grid;
    gap: var(--space-2, 10px);
  }
  .ck-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ck-label {
    width: 5em;
    flex: none;
    font-size: 0.875rem;
    color: var(--t2);
  }
  .ck-scale {
    font-size: 0.6875rem;
    color: var(--t4);
  }
  .ck-seg {
    display: inline-flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .ck-seg button {
    min-width: 34px;
    padding: 5px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--t2);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
  .ck-seg button:hover {
    background: var(--card-h);
  }
  .ck-seg button.on {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .ck-seg.wide { align-items: center; }

  /* —— Focus 负荷 —— */
  .meter-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3, 12px);
  }
  .meter-num {
    color: var(--t2);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .meter-num strong {
    color: var(--t1);
    font-size: 1.25rem;
    font-weight: 600;
  }
  .meter {
    height: 6px;
    border-radius: 3px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .meter-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.6s ease;
  }
  .meter-card[data-tone='hot'] .meter-fill { background: #e2a13d; }
  .meter-card[data-tone='break'] .meter-fill { background: var(--t4); }

  .facts {
    display: grid;
    gap: var(--space-2, 8px);
  }
  .facts div {
    display: grid;
    gap: 2px;
  }
  .facts dt {
    font-size: 0.75rem;
    color: var(--t4);
  }
  .facts dd {
    color: var(--t2);
    font-size: 0.875rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
  }
  .btn {
    appearance: none;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--t1);
    border-radius: 999px;
    padding: 8px 18px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--card-h);
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .btn.primary:hover {
    background: var(--accent-2);
  }
</style>
