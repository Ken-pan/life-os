<script>
  import { goto } from '$app/navigation'
  import {
    FOCUS,
    acceptFocusSuggestion,
    askLeaveSession,
    cancelLeavePrompt,
    dismissFocusSuggestion,
    elapsedSeconds,
    endSession,
    formatElapsed,
    leaveSessionTemporarily,
    pauseSession,
    resumeSession,
    returnSession,
  } from '$lib/kenos/focusStore.svelte.js'

  let now = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => {
      now = Date.now()
    }, 1000)
    return () => clearInterval(id)
  })

  const focus = $derived(FOCUS.focus)
  const flags = $derived({
    hideGlobalNav: FOCUS.focus?.status === 'active',
    showReturnBanner: FOCUS.focus?.status === 'temporarily_left',
    isPaused: FOCUS.focus?.status === 'paused',
  })
  const elapsed = $derived(formatElapsed(elapsedSeconds(now)))
  const shownSuggestions = $derived(FOCUS.suggestions.filter((s) => s.status === 'shown' || s.status === 'generated'))

  function continueSession() {
    cancelLeavePrompt()
  }

  function leaveTemporarily() {
    leaveSessionTemporarily()
    void goto('/')
  }

  function endAndSummarize() {
    endSession()
  }
</script>

{#if focus && (focus.status === 'active' || focus.status === 'paused' || focus.status === 'ending')}
  <div class="focus-shell" data-testid="focus-session-shell">
    <header class="session-bar">
      <div>
        <p class="mode">{focus.mode === 'training' ? 'Training' : focus.mode === 'deep_work' ? 'Deep Work' : focus.mode}</p>
        <h1>{focus.title}</h1>
        <p class="timer" aria-live="polite">{flags.isPaused ? '已暂停' : elapsed}</p>
      </div>
      <div class="actions">
        {#if flags.isPaused}
          <button type="button" onclick={resumeSession}>继续</button>
        {:else}
          <button type="button" onclick={pauseSession}>暂停</button>
        {/if}
        <button type="button" class="ghost" onclick={askLeaveSession}>离开</button>
        <button type="button" class="danger" onclick={endAndSummarize}>结束</button>
      </div>
    </header>

    <p class="scope">Assistant 限定在当前 Session · 跨域内容已延期（不显示数量角标）</p>

    <section class="panel">
      <h2>当前内容</h2>
      <p>{focus.safeSummary}</p>
      {#if focus.activeSessionRef}
        <p class="meta">Session · {focus.activeSessionRef.type}</p>
      {/if}
    </section>

    {#if shownSuggestions.length}
      <section class="panel">
        <h2>建议</h2>
        {#each shownSuggestions as suggestion (suggestion.id)}
          <article class="suggestion">
            <strong>{suggestion.title}</strong>
            <p>{suggestion.safeSummary}</p>
            <p class="why">为什么现在：{suggestion.whyNow}</p>
            <p class="why">依据：{suggestion.rationale}</p>
            <p class="why">影响：{suggestion.impactSummary}</p>
            <div class="suggestion-actions">
              <button type="button" onclick={() => acceptFocusSuggestion(suggestion.id)}>接受</button>
              <button type="button" class="ghost" onclick={() => dismissFocusSuggestion(suggestion.id)}>忽略</button>
            </div>
          </article>
        {/each}
      </section>
    {/if}

    {#if FOCUS.leavePromptOpen}
      <div class="leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title">
        <h2 id="leave-title">离开 Session？</h2>
        <button type="button" onclick={continueSession}>继续当前 Session</button>
        <button type="button" onclick={leaveTemporarily}>暂时离开</button>
        <button type="button" class="danger" onclick={endAndSummarize}>结束并总结</button>
      </div>
    {/if}
  </div>
{:else if focus?.status === 'temporarily_left'}
  <div class="return-banner" data-testid="focus-return-banner">
    <button type="button" onclick={() => { returnSession(); void goto('/focus') }}>
      返回 {focus.title} · {elapsed}
    </button>
  </div>
{:else if focus?.status === 'completed' && FOCUS.summary}
  <div class="summary" data-testid="focus-summary">
    <h1>{focus.mode === 'training' ? '训练完成' : '专注结束'} · {Math.round(FOCUS.summary.durationSeconds / 60)} 分钟</h1>
    <p>{FOCUS.summary.progress}</p>
    <ul>
      {#each FOCUS.summary.completedActions as action}
        <li>{action}</li>
      {/each}
    </ul>
    <p class="deferred">
      期间暂存：
      {#each Object.entries(FOCUS.summary.deferredItemCounts) as [domain, count]}
        <span>{count} 个 {domain}</span>
      {/each}
      · 无紧急事项倾倒
    </p>
    <p>{FOCUS.summary.nextRecommendedStep}</p>
    <div class="actions">
      <a href="/">回到 Today</a>
      <a href="/inbox">查看延期相关 Inbox</a>
    </div>
  </div>
{/if}

<style>
  .focus-shell {
    width: min(100% - 32px, 720px);
    margin: 0 auto;
    padding: 28px 0 96px;
  }
  .session-bar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  .mode {
    margin: 0 0 4px;
    color: var(--t3);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(28px, 5vw, 40px);
    letter-spacing: -0.04em;
  }
  .timer {
    margin: 8px 0 0;
    font-variant-numeric: tabular-nums;
    color: var(--t2);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button,
  a {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--border-l);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  button.danger {
    border-color: color-mix(in srgb, #b42318 40%, var(--border-l));
  }
  button.ghost {
    opacity: 0.85;
  }
  .scope,
  .meta,
  .why {
    color: var(--t3);
    font-size: var(--text-sm);
  }
  .panel {
    margin-top: 28px;
  }
  .panel h2 {
    margin: 0 0 10px;
    font-size: var(--text-title);
  }
  .suggestion {
    padding: 14px 0;
    border-top: 1px solid var(--border);
  }
  .suggestion-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .leave-modal {
    position: fixed;
    inset: auto 16px 24px;
    z-index: 90;
    display: grid;
    gap: 8px;
    padding: 16px;
    border-radius: 14px;
    background: var(--bg, #fff);
    border: 1px solid var(--border);
    box-shadow: 0 18px 48px color-mix(in srgb, #000 22%, transparent);
  }
  .return-banner {
    position: sticky;
    top: 0;
    z-index: 40;
    padding: 10px 16px;
    background: color-mix(in srgb, var(--t1) 6%, var(--bg, #fff));
    border-bottom: 1px solid var(--border);
  }
  .summary {
    width: min(100% - 32px, 720px);
    margin: 0 auto;
    padding: 40px 0 96px;
  }
  .deferred {
    color: var(--t2);
  }
  .deferred span {
    margin-right: 10px;
  }
</style>
