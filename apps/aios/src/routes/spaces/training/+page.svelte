<script>
  import { goto } from '$app/navigation'
  import { FOCUS, startTraining } from '$lib/kenos/focusStore.svelte.js'

  function begin() {
    if (FOCUS.focus && ['active', 'paused', 'temporarily_left', 'ending'].includes(FOCUS.focus.status)) {
      // Do not silently overwrite
      void goto('/focus')
      return
    }
    startTraining()
    void goto('/focus')
  }
</script>

<div class="space-page">
  <p class="kicker">Space · Training</p>
  <h1>Training</h1>
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

  <p class="note">本页为本地 Focus 纵向切片，不写生产 Training 真源。</p>
  <a href="/spaces">‹ All Spaces</a>
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
  .note {
    color: var(--t2);
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
  button,
  a {
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
  a {
    background: transparent;
    color: var(--t2);
  }
</style>
