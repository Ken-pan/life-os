<script>
  import { onMount } from 'svelte'
  import { t } from '$lib/i18n/index.js'
  import { A, act, pollState } from '$lib/agent.svelte.js'

  onMount(() => pollState())

  const greeting = $derived.by(() => {
    const h = new Date().getHours()
    if (h < 12) return t('now.greetingMorning')
    if (h < 18) return t('now.greetingAfternoon')
    return t('now.greetingEvening')
  })

  const s = $derived(A.state)
  const paused = $derived(Boolean(s?.paused))
  const netMinutes = $derived(Math.floor((s?.score ?? 0) / 60))
  const limitMinutes = $derived(Math.max(1, Math.floor((s?.limitSeconds ?? 1200) / 60)))
  const frac = $derived(Math.min(1, (s?.score ?? 0) / (s?.limitSeconds || 1200)))

  const headline = $derived.by(() => {
    if (!A.online) return t('now.stateOffline')
    if (paused) return t('now.statePaused')
    switch (s?.phase) {
      case 'breaking':
        return t('now.stateBreaking')
      case 'warning':
        return t('now.stateWarning')
      default:
        return (s?.score ?? 0) >= 60 ? t('now.stateBuilding') : t('now.stateIdle')
    }
  })

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

  {#if !A.online}
    <section class="card offline">
      <h3>{t('now.agentOffline')}</h3>
      <p class="muted">{t('now.agentOfflineHint')}</p>
      <code>{t('now.agentInstallCmd')}</code>
    </section>
  {:else}
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

  .offline code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8125rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    padding: 8px 12px;
    width: fit-content;
  }

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
    background: var(--warning, #e2a13d);
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
