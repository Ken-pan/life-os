<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import { A, pollState, refreshDetails } from '$lib/agent.svelte.js'

  onMount(() => {
    const stop = pollState()
    const boot = setTimeout(refreshDetails, 300)
    const id = setInterval(refreshDetails, 10000)
    return () => {
      stop()
      clearTimeout(boot)
      clearInterval(id)
    }
  })

  const s = $derived(A.state)
  const inSession = $derived(A.online && Boolean(s?.session))
  const netMinutes = $derived(Math.floor((s?.session?.netSeconds ?? s?.score ?? 0) / 60))

  const phaseLabel = $derived.by(() => {
    switch (s?.phase) {
      case 'warning':
        return t('focus.phaseWarning')
      case 'breaking':
        return t('focus.phaseBreaking')
      default:
        return t('focus.phaseNormal')
    }
  })

  const fmtTime = (epoch) =>
    new Date(epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const fmtDay = (epoch) =>
    new Date(epoch * 1000).toLocaleDateString([], { month: 'numeric', day: 'numeric' })
  const fmtDur = (secs) => {
    const m = Math.round((secs ?? 0) / 60)
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
  }
  const endLabel = (reason) => {
    const key = `focus.end_${reason}`
    const label = t(key)
    return label === key ? reason : label
  }
  const eventLabel = (type) => {
    const key = `focus.ev_${type}`
    const label = t(key)
    return label === key ? type : label
  }

  const guard = $derived(A.config)
</script>

<div class="wrap">
  <section class="card">
    <h3>{t('focus.currentSession')}</h3>
    {#if inSession}
      <div class="session-live">
        <span class="pulse" data-phase={s?.phase ?? 'normal'}></span>
        <div>
          <p class="session-main">
            {phaseLabel} · {t('focus.sessionNet')} {netMinutes} {t('now.minutesUnit')}
          </p>
          <p class="muted">{t('focus.sessionSince')} {fmtTime(s.session.start)} · {s?.note ?? ''}</p>
        </div>
      </div>
    {:else}
      <p class="muted">{t('focus.noSession')}</p>
    {/if}
  </section>

  {#if guard}
    <section class="card">
      <h3>{t('focus.guardrails')}</h3>
      <dl class="guard">
        <div>
          <dt>{t('focus.guardLimit')}</dt>
          <dd>{Math.floor((guard.limitSeconds ?? 0) / 60)} {t('now.minutesUnit')}</dd>
        </div>
        <div>
          <dt>{t('focus.guardRest')}</dt>
          <dd>{Math.floor((guard.restSeconds ?? 0) / 60)} {t('now.minutesUnit')}</dd>
        </div>
        <div>
          <dt>{t('focus.guardWarn')}</dt>
          <dd>{guard.warnSeconds ?? 0}s</dd>
        </div>
        <div>
          <dt>{t('focus.guardDrain')}</dt>
          <dd>1 : {guard.drainRatio ?? 1}</dd>
        </div>
        <div>
          <dt>{t('focus.guardChat')}</dt>
          <dd>{t('focus.guardChatValue').replace('{min}', String(Math.floor((guard.chatSustainedSeconds ?? 120) / 60)))}</dd>
        </div>
      </dl>
    </section>
  {/if}

  <section class="card">
    <h3>{t('focus.history')}</h3>
    {#if A.sessions.length === 0}
      <p class="muted">{t('focus.noHistory')}</p>
    {:else}
      <ul class="rows">
        {#each A.sessions.slice(0, 30) as row (row.start)}
          <li>
            <span class="row-when">{fmtDay(row.start)} {fmtTime(row.start)}</span>
            <span class="row-main">{fmtDur(row.peakNetSeconds)}</span>
            <span class="row-tail">{endLabel(row.endReason)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card">
    <h3>{t('focus.interventions')}</h3>
    {#if A.events.length === 0}
      <p class="muted">{t('focus.noInterventions')}</p>
    {:else}
      <ul class="rows">
        {#each A.events.slice(0, 30) as ev, i (`${ev.ts}-${i}`)}
          <li>
            <span class="row-when">{fmtDay(ev.ts)} {fmtTime(ev.ts)}</span>
            <span class="row-main">{eventLabel(ev.type)}</span>
            {#if ev.detail}<span class="row-tail">{ev.detail}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-5, 20px);
    margin-block: var(--space-4, 16px) 0;
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

  .session-live {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
  }
  .session-main {
    color: var(--t1);
    font-weight: 500;
  }
  .pulse {
    flex: none;
    width: 10px;
    height: 10px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-bg);
  }
  .pulse[data-phase='warning'] {
    background: var(--warning, #e2a13d);
    box-shadow: 0 0 0 4px rgba(226, 161, 61, 0.18);
  }
  .pulse[data-phase='breaking'] {
    background: var(--t4);
    box-shadow: 0 0 0 4px var(--bg-2);
  }

  .guard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: var(--space-3, 12px);
  }
  .guard div {
    display: grid;
    gap: 2px;
  }
  .guard dt {
    font-size: 0.75rem;
    color: var(--t4);
  }
  .guard dd {
    color: var(--t1);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
  }

  .rows {
    list-style: none;
    display: grid;
    gap: 0;
  }
  .rows li {
    display: flex;
    align-items: baseline;
    gap: var(--space-3, 12px);
    padding-block: 9px;
    border-top: 1px solid var(--border);
    font-size: 0.875rem;
  }
  .rows li:first-child {
    border-top: 0;
  }
  .row-when {
    flex: none;
    width: 7.5em;
    color: var(--t4);
    font-variant-numeric: tabular-nums;
  }
  .row-main {
    color: var(--t1);
  }
  .row-tail {
    margin-left: auto;
    color: var(--t3);
    font-size: 0.8125rem;
    text-align: right;
  }
</style>
