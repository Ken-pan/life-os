<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { FOCUS, startTraining } from '$lib/kenos/focusStore.svelte.js'
  import {
    isProdTrainingReadEnabled,
    readTrainingSpaceSource,
  } from '$lib/kenos/trainingReadSource.core.js'
  import { lifeOsReadClient } from '$lib/lifeos.js'
  import { isCloudAuthorized } from '$lib/cloud.svelte.js'

  const prodReadOn = isProdTrainingReadEnabled()

  /** @type {null | { trainedToday?: boolean, bodyParts?: string[], lastSessionAt?: string | null, sessionCount?: number, deepLink?: string }} */
  let training = $state(null)
  /** @type {null | { status?: string, message?: string, retryable?: boolean, lastUpdated?: string | null }} */
  let sourceState = $state(null)
  let loading = $state(false)

  const FITNESS_URL = 'https://fitness.kenos.space'

  function formatSessionAt(value) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  async function loadTraining() {
    loading = true
    try {
      const result = await readTrainingSpaceSource({
        client: lifeOsReadClient(),
        authorized: isCloudAuthorized(),
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
      })
      training = result.training
      sourceState = result.state
    } finally {
      loading = false
    }
  }

  function begin() {
    if (FOCUS.focus && ['active', 'paused', 'temporarily_left', 'ending'].includes(FOCUS.focus.status)) {
      // Do not silently overwrite
      void goto('/focus')
      return
    }
    startTraining()
    void goto('/focus')
  }

  onMount(() => {
    if (prodReadOn) void loadTraining()
  })
</script>

<div class="space-page">
  <p class="kicker">Space · Training</p>
  <h1>Training</h1>

  {#if prodReadOn}
    <p class="intro">只读 Fitness 今日摘要。训练计划与写操作以 Fitness OS 为准。</p>

    <section class="workout" aria-live="polite">
      {#if loading && !sourceState}
        <p class="status">正在读取 Training 摘要…</p>
      {:else if sourceState && ['unavailable', 'offline', 'permission_denied'].includes(sourceState.status)}
        <h2>Training 摘要不可用</h2>
        <p class="status">
          {#if sourceState.status === 'offline'}
            当前离线，不显示假训练计划。
          {:else if sourceState.status === 'permission_denied'}
            登录后才能读取 Training 摘要。
          {:else}
            暂时无法读取 Training 摘要。
          {/if}
          {#if sourceState.message}
            <span class="detail">{sourceState.message}</span>
          {/if}
        </p>
        {#if sourceState.retryable}
          <button type="button" class="secondary" onclick={() => loadTraining()} disabled={loading}>
            {loading ? '重试中…' : '重试'}
          </button>
        {/if}
      {:else if training}
        <h2>今日 Training</h2>
        {#if !training.trainedToday && !(training.bodyParts?.length)}
          <p class="status">今日尚未训练（诚实空状态，非 Push Day 演示）。</p>
        {:else}
          <dl class="summary">
            <div>
              <dt>今日已练</dt>
              <dd>{training.trainedToday ? '是' : '否'}</dd>
            </div>
            <div>
              <dt>部位</dt>
              <dd>
                {#if training.bodyParts?.length}
                  {training.bodyParts.join(' · ')}
                {:else}
                  —
                {/if}
              </dd>
            </div>
            <div>
              <dt>上次训练</dt>
              <dd>{formatSessionAt(training.lastSessionAt) ?? '—'}</dd>
            </div>
          </dl>
        {/if}
      {:else}
        <h2>暂无 Training 数据</h2>
        <p class="status">没有可读的 Fitness 摘要；不会回退到本地 Push Day。</p>
      {/if}

      <div class="actions">
        <a class="primary" href={training?.deepLink || FITNESS_URL} target="_blank" rel="noopener noreferrer">
          打开 Fitness OS
        </a>
        <button type="button" class="secondary" onclick={begin}>本机 Focus（非 Fitness 真源）</button>
      </div>
    </section>

    <p class="note">生产读路径开启：本页只读 `portal_today_summary.fitness`，不写生产 Training，也不把本地 Focus 当 Fitness 真源。</p>
  {:else}
    <p class="intro">开始一次专注训练。全局导航会隐藏；Work / Money / Inbox 数字不会跟进来。</p>

    <section class="workout">
      <h2>今日计划 · Push Day</h2>
      <ol>
        <li>Bench press · 4×6</li>
        <li>Overhead press · 3×8</li>
        <li>Cable fly · 3×12</li>
        <li>Triceps · 3×12</li>
      </ol>
      <button type="button" onclick={begin}>开始训练 Focus</button>
    </section>

    <p class="note">
      本页为本地 Focus 演示切片，不是生产 Fitness 真源：不读、不写 Fitness / Training 数据；Push Day 为演示占位。
    </p>
  {/if}

  <a class="back" href="/spaces">‹ All Spaces</a>
</div>

<style>
  .space-page {
    width: min(100% - 32px, 720px);
    margin: 0 auto;
    padding: 32px 0 96px;
  }
  .kicker {
    margin: 0 0 6px;
    color: var(--t3);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: var(--text-xs);
  }
  h1 {
    margin: 0;
    font-size: clamp(34px, 5vw, 48px);
    letter-spacing: -0.04em;
  }
  .intro,
  .note,
  .status,
  .detail {
    color: var(--t2);
  }
  .detail {
    display: block;
    margin-top: 6px;
    font-size: var(--text-sm);
  }
  .workout {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  ol {
    padding-left: 1.2rem;
    color: var(--t2);
  }
  .summary {
    display: grid;
    gap: 12px;
    margin: 0;
  }
  .summary div {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 8px;
  }
  .summary dt {
    margin: 0;
    color: var(--t3);
  }
  .summary dd {
    margin: 0;
    color: var(--t1);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }
  button,
  a.primary,
  a.back {
    display: inline-flex;
    margin-top: 16px;
    min-height: 40px;
    padding: 0 14px;
    align-items: center;
    border-radius: 10px;
    border: 1px solid var(--border-l);
    background: var(--t1);
    color: var(--bg);
    text-decoration: none;
    font: inherit;
    cursor: pointer;
  }
  .actions button,
  .actions a.primary {
    margin-top: 0;
  }
  button.secondary {
    background: transparent;
    color: var(--t2);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  a.back {
    background: transparent;
    color: var(--t2);
  }
</style>
