<script>
  import { onMount } from 'svelte'
  import { LineChart, BarChart } from '@life-os/platform-web/svelte/charts'
  import { t } from '$lib/i18n/index.js'
  import { A, pollState, refreshDetails } from '$lib/agent.svelte.js'
  import { metricSeries, trendSummary } from '$lib/stateEngine.core.js'

  let nowMs = $state(Date.now())

  onMount(() => {
    const stop = pollState()
    const boot = setTimeout(refreshDetails, 300)
    const details = setInterval(refreshDetails, 15000)
    return () => {
      stop()
      clearTimeout(boot)
      clearInterval(details)
    }
  })

  const fmt = (key, p) =>
    t(key).replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''))
  const hasMeasured = $derived(A.health.length > 0)

  const median = (nums) => {
    const v = nums.filter((n) => typeof n === 'number').sort((a, b) => a - b)
    if (!v.length) return null
    const m = Math.floor(v.length / 2)
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
  }

  // 指标配置:睡眠用柱、生理信号用面积折线;good 决定“↑好还是↓好”标注
  const METRICS = [
    {
      key: 'sleepHours',
      label: 'trends.sleep',
      unit: 'trends.hoursUnit',
      kind: 'bar',
      good: 'high',
      fmt: (v) => v.toFixed(1),
    },
    {
      key: 'hrv',
      label: 'trends.hrv',
      unit: 'trends.msUnit',
      kind: 'line',
      good: 'high',
      fmt: (v) => String(Math.round(v)),
    },
    {
      key: 'restingHR',
      label: 'trends.restingHR',
      unit: 'trends.bpmUnit',
      kind: 'line',
      good: 'low',
      fmt: (v) => String(Math.round(v)),
    },
    {
      key: 'steps',
      label: 'trends.steps',
      unit: '',
      kind: 'line',
      good: 'high',
      fmt: (v) =>
        v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
    },
    {
      key: 'activeEnergyKcal',
      label: 'trends.activeEnergy',
      unit: 'trends.kcalUnit',
      kind: 'line',
      good: 'high',
      fmt: (v) => String(Math.round(v)),
    },
    {
      key: 'exerciseMinutes',
      label: 'trends.exercise',
      unit: 'trends.minUnit',
      kind: 'bar',
      good: 'high',
      fmt: (v) => String(Math.round(v)),
    },
  ]

  // 趋势方向的语义色:结合“越高越好/越低越好”判断这个方向是好是坏
  const toneOf = (dir, good) => {
    if (dir === 'up') return good === 'high' ? 'good' : 'bad'
    if (dir === 'down') return good === 'high' ? 'bad' : 'good'
    return 'neutral'
  }

  const cards = $derived(
    METRICS.map((m) => {
      const s = metricSeries(A.health, m.key, 14, nowMs)
      const sum = trendSummary(s.values, 7)
      return {
        ...m,
        series: s,
        summary: sum,
        baseline: median(s.values),
        tone: toneOf(sum.dir, m.good),
      }
    }),
  )
</script>

<div class="wrap">
  {#if !hasMeasured}
    <section class="card empty">
      <h3>{t('trends.title')}</h3>
      <p class="muted">{t('trends.empty')}</p>
      <code class="cmd">{t('trends.emptyCmd')}</code>
    </section>
  {:else}
    {#each cards as c (c.key)}
      <section class="card">
        <header class="chart-head">
          <div>
            <h3>{t(c.label)}</h3>
            <span class="good"
              >{c.good === 'high'
                ? t('trends.goodHigh')
                : t('trends.goodLow')}</span
            >
          </div>
          <div class="summary" data-tone={c.tone}>
            {#if c.summary.recent != null}
              <span class="avg"
                >{fmt('trends.avg7', {
                  v: `${c.fmt(c.summary.recent)}${c.unit ? t(c.unit) : ''}`,
                })}</span
              >
            {/if}
            <span class="dir">{t(`trends.dir_${c.summary.dir}`)}</span>
          </div>
        </header>
        {#if c.kind === 'bar'}
          <BarChart
            labels={c.series.labels}
            series={[{ label: t(c.label), values: c.series.values }]}
            height={150}
            format={c.fmt}
            ariaLabel={t(c.label)}
          />
        {:else}
          <LineChart
            labels={c.series.labels}
            series={[{ label: t(c.label), values: c.series.values }]}
            height={150}
            area
            baseline="auto"
            format={c.fmt}
            ariaLabel={t(c.label)}
          />
        {/if}
        {#if c.baseline != null}
          <p class="baseline">
            {t('trends.baseline')}: {c.fmt(c.baseline)}{c.unit ? t(c.unit) : ''}
          </p>
        {/if}
      </section>
    {/each}
  {/if}
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
  .cmd {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8125rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    padding: 8px 12px;
    width: fit-content;
  }
  .chart-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    flex-wrap: wrap;
  }
  .good {
    font-size: 0.6875rem;
    color: var(--t4);
  }
  .summary {
    text-align: right;
    display: grid;
    gap: 2px;
  }
  .avg {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .dir {
    font-size: 0.75rem;
    color: var(--t3);
  }
  .summary[data-tone='good'] .dir {
    color: var(--positive);
  }
  .summary[data-tone='bad'] .dir {
    color: var(--warning);
  }
  .baseline {
    font-size: 0.75rem;
    color: var(--t4);
    font-variant-numeric: tabular-nums;
  }
</style>
