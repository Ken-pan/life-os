<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import {
    A,
    act,
    pushPolicy,
    pollState,
    refreshDetails,
  } from '$lib/agent.svelte.js'
  import {
    deriveState,
    recommendPolicy,
    todayTrainingLedger,
    trainingRecommendation,
    DIMENSION_ORDER,
  } from '$lib/stateEngine.core.js'
  import { S } from '$lib/state.svelte.js'
  import { syncHealthLocalAlerts } from '$lib/healthLocalAlerts.js'

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
  const fmt = (key, p) =>
    t(key).replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''))
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
    const warnsToday = A.events.filter(
      (e) => e.type === 'warn_shown' && e.ts >= t0,
    ).length
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

  // Understand:全部从测量数据(A.health)+ 代理负荷推导,零手动输入
  const engine = $derived(
    deriveState({ now: nowMs, health: A.health, agent: agentInput }),
  )
  // 是否已有任何测量数据(睡眠/HRV/心率/步数/活动),没有则显示连表引导而非状态网格
  const hasMeasured = $derived(A.health.length > 0)
  const trainLedger = $derived(todayTrainingLedger(A.health, nowMs))
  const trainRec = $derived(trainingRecommendation(engine.dims, trainLedger))
  const trainFacts = $derived(
    fmt('now.trainFacts', {
      steps: trainLedger.steps != null ? Math.round(trainLedger.steps) : '—',
      kcal:
        trainLedger.activeEnergyKcal != null
          ? Math.round(trainLedger.activeEnergyKcal)
          : '—',
      ex:
        trainLedger.exerciseMinutes != null
          ? Math.round(trainLedger.exerciseMinutes)
          : '—',
      wc: trainLedger.workoutCount || 0,
      wm:
        trainLedger.workoutMinutes != null
          ? Math.round(trainLedger.workoutMinutes)
          : '—',
    }),
  )

  // HLT-3:按当日状态推荐专注窗口,变化时推给代理(driver 决定收紧或回到基准)
  const baseMinutes = $derived(
    Math.max(1, Math.round((s?.baseLimitSeconds ?? 1200) / 60)),
  )
  const policy = $derived(recommendPolicy(engine.dims, baseMinutes))
  let lastPushed = $state(null)

  $effect(() => {
    if (!A.online || paused) return
    const desiredReason = policy.driver
      ? t(`now.policyReason_${policy.driver}`)
      : null
    const key = policy.driver
      ? `${policy.limitMinutes}:${policy.driver}`
      : 'base'
    // 只在推荐变化、且与代理当前生效状态不一致时推送,避免每帧打接口
    const agentEffMin = Math.round((s?.limitSeconds ?? 1200) / 60)
    const agentHasPolicy = Boolean(s?.policyReason)
    const inSync = policy.driver
      ? agentEffMin === policy.limitMinutes && agentHasPolicy
      : !agentHasPolicy
    if (key !== lastPushed && !inSync) {
      lastPushed = key
      pushPolicy(policy.limitMinutes, desiredReason)
    }
  })

  // Continuity edge alerts only (no Mac break spam).
  $effect(() => {
    const sleepDebtLevel = engine.dims?.sleepDebt?.level
    const agentPhase = s?.phase ?? 'normal'
    const now = new Date(nowMs)
    const enabled = S.settings.localAlerts !== false
    void syncHealthLocalAlerts({
      sleepDebtLevel,
      agentPhase,
      now,
      enabled,
    }).catch(() => {})
  })

  const headline = $derived.by(() => {
    if (!hasMeasured) {
      if (!A.online) return t('now.stateOffline')
      return t('state.h_noData')
    }
    if (paused && engine.headline.k === 'state.h_allGood')
      return t('now.statePaused')
    return fmt(engine.headline.k, engine.headline.p)
  })

  // —— Focus 负荷条(沿用 HLT-1)——
  const netMinutes = $derived(Math.floor((s?.score ?? 0) / 60))
  const limitMinutes = $derived(
    Math.max(1, Math.floor((s?.limitSeconds ?? 1200) / 60)),
  )
  const frac = $derived(
    Math.min(1, (s?.score ?? 0) / (s?.limitSeconds || 1200)),
  )
  const meterTone = $derived.by(() => {
    if (!A.online || paused) return 'idle'
    if (s?.phase === 'breaking') return 'break'
    if (s?.phase === 'warning' || frac > 0.85) return 'hot'
    return frac >= 0.05 ? 'active' : 'idle'
  })

  /** Strip CPU peak debug fragments from older agent notes. */
  const scrubNote = (note) => {
    if (!note) return ''
    return String(note)
      .replace(/CPU\s*峰[\d.]+%\s*\/\s*合[\d.]+%/gi, '工具负载偏高')
      .replace(/CPU\s*峰[\d.]+%/gi, '工具负载偏高')
      .replace(/\bCPU\b[^·]*/gi, (m) =>
        m.toLowerCase().includes('阈值') ? m : '工具负载偏高',
      )
      .replace(/\s*·\s*·\s*/g, ' · ')
      .trim()
  }
  const liveNote = $derived(scrubNote(s?.note) || '—')
</script>

<div class="wrap">
  <header class="hero">
    <p class="greet">{greeting}, Ken</p>
    <h2 class="headline">{headline}</h2>
  </header>

  <!-- 六维状态(Understand 层,全部由测量数据被动推导,每格可解释来源) -->
  {#if hasMeasured}
    <section class="card">
      <div class="dims-head">
        <h3>{t('now.dims')}</h3>
        <span class="health-chip" title={t('now.healthConnected')}>
          <i class="chip-dot"></i>{fmt('now.healthConnected', {
            n: A.health.length,
          })}
        </span>
      </div>
      <div class="dims">
        {#each DIMENSION_ORDER as key (key)}
          {@const dim = engine.dims[key]}
          <article class="dim" data-level={dim.level}>
            <header class="dim-head">
              <span class="dim-name">{t(`state.dim_${key}`)}</span>
              <span class="dim-level"
                ><i class="dot"></i>{t(`state.level_${dim.level}`)}</span
              >
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
  {/if}

  <!-- 今日训练对账:活动/Workout → 是否宜练(不泄跨 OS 明细) -->
  {#if hasMeasured}
    <section class="card train" data-code={trainRec.code}>
      <h3>{t('now.trainTitle')}</h3>
      <p class="train-rec">{t(trainRec.k)}</p>
      <p class="muted train-facts">{trainFacts}</p>
    </section>
  {/if}

  <!-- 无测量数据:引导连 Apple Health,绝不给手动表单 -->
  {#if !hasMeasured}
    <section class="card connect">
      <h3>{t('now.connectWatch')}</h3>
      <p class="muted">{t('now.connectWatchHint')}</p>
      <code class="cmd">{t('now.connectWatchCmd')}</code>
    </section>
  {/if}

  <!-- Focus 负荷 + 最小行动(Regulate 层) -->
  {#if A.online}
    <section class="card meter-card" data-tone={meterTone}>
      <div class="meter-head">
        <h3>{t('now.focusMeter')}</h3>
        <span class="meter-num">
          <strong>{netMinutes}</strong> / {limitMinutes}
          {t('now.minutesUnit')}
        </span>
      </div>
      <div
        class="meter"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax={limitMinutes}
        aria-valuenow={netMinutes}
        aria-label={t('now.focusMeter')}
      >
        <div class="meter-fill" style:width={`${frac * 100}%`}></div>
      </div>
      <dl class="facts">
        <div>
          <dt>{t('now.adaptiveWindow')}</dt>
          <dd>
            {#if s?.policyReason}
              {fmt('now.adaptiveTightened', {
                min: limitMinutes,
                reason: s.policyReason,
              })}
            {:else}
              {fmt('now.adaptiveBase', { min: limitMinutes })}
            {/if}
          </dd>
        </div>
        <div>
          <dt>{t('now.signalNow')}</dt>
          <dd>{liveNote}</dd>
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
          <button class="btn primary" onclick={() => act('resume')}
            >{t('now.actResume')}</button
          >
        {:else}
          <button class="btn primary" onclick={() => act('break')}
            >{t('now.actBreak')}</button
          >
          <button class="btn" onclick={() => act('pause30')}
            >{t('now.actPause30')}</button
          >
          <button class="btn" onclick={() => act('pauseToday')}
            >{t('now.actPauseToday')}</button
          >
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

  .train-rec {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--t1);
    line-height: 1.4;
  }
  .train-facts {
    font-size: 0.8125rem;
  }
  .train[data-code='recover'],
  .train[data-code='already_trained'] {
    border-color: color-mix(in srgb, var(--warn, #c9a227) 45%, var(--border));
  }
  .train[data-code='ok_to_train'] {
    border-color: color-mix(in srgb, var(--ok, #3d9a6a) 40%, var(--border));
  }

  /* —— 六维状态 —— */
  .dims-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3, 12px);
  }
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
  .dim[data-level='good'] .dot {
    background: var(--positive);
  }
  .dim[data-level='ok'] .dot {
    background: var(--accent);
  }
  .dim[data-level='watch'] .dot {
    background: var(--warning);
  }
  .dim[data-level='bad'] .dot {
    background: var(--critical);
  }
  .dim[data-level='good'] .dim-level {
    color: var(--positive);
  }
  .dim[data-level='watch'] .dim-level {
    color: var(--warning);
  }
  .dim[data-level='bad'] .dim-level {
    color: var(--critical);
  }
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

  /* —— 数据源 —— */
  .health-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.75rem;
    color: var(--t3);
  }
  .chip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--positive);
    box-shadow: 0 0 0 3px var(--positive-subtle);
  }

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
  .meter-card[data-tone='hot'] .meter-fill {
    background: var(--warning);
  }
  .meter-card[data-tone='break'] .meter-fill {
    background: var(--t4);
  }

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
