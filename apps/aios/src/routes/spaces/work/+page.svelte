<script>
  import { goto } from '$app/navigation'
  import { FOCUS, startDeepWork } from '$lib/kenos/focusStore.svelte.js'

  function begin() {
    if (FOCUS.focus && ['active', 'paused', 'temporarily_left', 'ending'].includes(FOCUS.focus.status)) {
      void goto('/focus')
      return
    }
    startDeepWork({ title: 'Kenos IA', projectId: 'a1000000-0000-4000-8000-000000000001' })
    void goto('/focus')
  }
</script>

<div class="space-page">
  <p class="kicker">Space · Work</p>
  <h1>Deep Work</h1>
  <p class="intro">进入当前项目的专注模式。只保留 Work / Plan / Library；Home 与 Money 会延期。</p>

  <section class="project">
    <h2>Kenos IA</h2>
    <p>导航信息架构与 Focus 上下文</p>
    <ul>
      <li>Deliverable：Focus contracts</li>
      <li>Plan task：本地投影（只读）</li>
      <li>Library：Phase brief（引用）</li>
    </ul>
    <button type="button" onclick={begin}>开始 Deep Work Focus</button>
  </section>

  <p class="note">本地模拟：不修改生产 Work/Plan，不走生产 Executor。</p>
  <div class="links">
    <a href="/work">打开完整 Work hub</a>
    <a href="/spaces">‹ All Spaces</a>
  </div>
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
  .project {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  ul {
    color: var(--t2);
  }
  button {
    margin-top: 16px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 10px;
    border: none;
    background: var(--t1);
    color: var(--bg);
    font: inherit;
    cursor: pointer;
  }
  .links {
    display: flex;
    gap: 16px;
    margin-top: 20px;
  }
  a {
    color: var(--t2);
  }
</style>
