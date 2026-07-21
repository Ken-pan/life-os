<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { FOCUS, startDeepWork } from '$lib/kenos/focusStore.svelte.js'
  import {
    isIosNativeShell,
    requestNativeSpaceShelf,
  } from '$lib/kenos/iosNativeShell.js'
  import {
    installWorkLeaveGuard,
    persistWorkContinue,
    suspendWorkSpace,
  } from '$lib/kenos/workSpaceAdapter.js'

  const nativeShell = $derived(isIosNativeShell())

  onMount(() => {
    installWorkLeaveGuard()
    persistWorkContinue(
      suspendWorkSpace({
        pathname: '/spaces/work',
        focusActive: true,
        projectTitle: 'Kenos IA',
        projectId: 'a1000000-0000-4000-8000-000000000001',
      }),
    )
  })

  function begin() {
    if (FOCUS.focus && ['active', 'paused', 'temporarily_left', 'ending'].includes(FOCUS.focus.status)) {
      void goto('/focus')
      return
    }
    startDeepWork({ title: 'Kenos IA', projectId: 'a1000000-0000-4000-8000-000000000001' })
    void goto('/focus')
  }

  function openSpacesShelf(event) {
    if (nativeShell && requestNativeSpaceShelf()) {
      event?.preventDefault?.()
    }
  }
</script>

<div class="space-page" class:native-shell={nativeShell} data-domain="work">
  <h1 class="kenos-page-title">Deep Work</h1>
  <p class="intro">进入当前项目的专注模式。只保留与这次工作相关的上下文。</p>

  <section class="project">
    <h2>Kenos IA</h2>
    <p>导航信息架构与 Focus 上下文</p>
    <ul>
      <li>下一步：Focus contracts</li>
      <li>相关任务在 Plan 中查看</li>
    </ul>
    <button type="button" onclick={begin}>开始 Deep Work</button>
  </section>

  <div class="links">
    <a href="/work">打开 Work</a>
    {#if !nativeShell}
      <a href="/spaces" onclick={openSpacesShelf}>‹ All Spaces</a>
    {/if}
  </div>
</div>

<style>
  .space-page {
    width: min(100% - 32px, 720px);
    margin: 0 auto;
    padding: var(--kenos-space-page-top, 24px) 0 var(--kenos-mobile-bottom-pad, 96px);
  }
  .intro {
    margin: 10px 0 0;
    color: var(--t2);
    font-size: var(--kenos-type-body);
    line-height: var(--kenos-leading-body);
  }
  .project {
    margin-top: 28px;
    padding: 16px 0;
    border-top: 1px solid var(--border);
  }
  .project h2 {
    margin: 0 0 6px;
    font-size: var(--kenos-type-section);
  }
  .project p {
    margin: 0 0 12px;
    color: var(--t2);
  }
  .project ul {
    margin: 0 0 16px;
    padding-left: 1.2em;
    color: var(--t3);
  }
  .project button {
    appearance: none;
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--kenos-radius-control, 8px);
    background: var(--t1);
    color: var(--bg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 28px;
  }
  .links a {
    color: var(--t2);
    text-decoration: none;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
</style>
