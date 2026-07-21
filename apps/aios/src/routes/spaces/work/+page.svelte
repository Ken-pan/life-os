<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { FOCUS, startDeepWork } from '$lib/kenos/focusStore.svelte.js'
  import {
    createNativeUnlockController,
    isIosNativeShell,
    NATIVE_UNLOCK_KEYS,
    requestNativeSpaceShelf,
  } from '$lib/kenos/iosNativeShell.js'
  import {
    installWorkLeaveGuard,
    persistWorkContinue,
    suspendWorkSpace,
  } from '$lib/kenos/workSpaceAdapter.js'

  let unlockState = $state(/** @type {'pending'|'open'|'locked'} */ ('open'))
  const workUnlock = createNativeUnlockController({
    storageKey: NATIVE_UNLOCK_KEYS.work,
    reason: 'Unlock Work',
  })

  const nativeShell = $derived(
    page.url.searchParams.get('iosNativeShell') === '1' || isIosNativeShell(),
  )

  function requestWorkUnlock({ force = false, prompt = true } = {}) {
    if (prompt || force) unlockState = 'pending'
    void workUnlock.unlock({ force, prompt }).then((next) => {
      unlockState = next
    })
  }

  function cancelWorkUnlock() {
    void workUnlock.cancel().then(() => {
      unlockState = 'locked'
    })
  }

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
    if (isIosNativeShell()) {
      // Restore grant only — never auto-present Face ID on remount.
      unlockState = 'locked'
      requestWorkUnlock({ prompt: false })
    }
    return () => workUnlock.dispose()
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
  {#if unlockState === 'locked' || unlockState === 'pending'}
    <section data-testid="work-native-unlock-gate" aria-busy={unlockState === 'pending'}>
      <h1 class="kenos-page-title">Work locked</h1>
      <p class="intro">
        {unlockState === 'pending'
          ? 'Waiting for Face ID or passcode…'
          : 'Use Face ID or passcode to open Work in Kenos.'}
      </p>
      {#if unlockState === 'pending'}
        <button type="button" onclick={cancelWorkUnlock}>Cancel</button>
      {/if}
      <button
        type="button"
        onclick={() =>
          requestWorkUnlock(
            unlockState === 'pending' ? { force: true } : { prompt: true },
          )
        }
      >
        {unlockState === 'pending' ? 'Try again' : 'Unlock'}
      </button>
    </section>
  {:else}
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
  {/if}
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
  .project button,
  [data-testid='work-native-unlock-gate'] button {
    appearance: none;
    min-height: 44px;
    margin-top: 16px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--kenos-radius-control, 8px);
    background: var(--t1);
    color: var(--bg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .project button {
    margin-top: 0;
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
