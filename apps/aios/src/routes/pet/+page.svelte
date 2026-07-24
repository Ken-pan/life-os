<script>
  import { onMount, untrack } from 'svelte'
  import { browser } from '$app/environment'
  import { S } from '$lib/state.svelte.js'
  import {
    LEO_PET_IDLE_TICK_MS,
    leoPetShouldAnimate,
    resolveLeoPetPose,
  } from '$lib/kenos/leoPet.core.js'
  import {
    createLeoPetPetting,
    createLeoPetQuipBox,
    leoPetQuipPose,
    pickLeoPetSayQuip,
  } from '$lib/kenos/leoPetQuips.core.js'
  import LeoPetSprite from '$lib/components/LeoPetSprite.svelte'
  import {
    PET,
    bumpLeoPetActivity,
    bindLeoPetCrossWindow,
    prefersLeoPetReducedMotion,
    preloadLeoPetAssets,
    publishLeoPetContext,
    requestLeoPetOpenAssistant,
    setLeoPetTucked,
    triggerLeoPetClick,
  } from '$lib/kenos/leoPet.svelte.js'
  import {
    bindLeoPetWindowPosPersistence,
  } from '$lib/kenos/leoPetDesktop.js'
  import { t } from '$lib/i18n/index.js'

  let nowTick = $state(0)
  let pageHidden = $state(false)
  let menuOpen = $state(false)
  let menuX = $state(0)
  let menuY = $state(0)

  const pose = $derived.by(() => {
    void nowTick
    const remote = PET.remote
    return resolveLeoPetPose({
      streaming: Boolean(remote?.streaming),
      toolRunning: Boolean(remote?.toolRunning),
      imageGen: Boolean(remote?.imageGen),
      speaking: PET.speaking,
      listening: PET.listening,
      softMode: Date.now() < PET.softUntil,
      idleMs: Date.now() - PET.lastActivityAt,
      clickRemainingMs: Math.max(0, PET.clickUntil - Date.now()),
      clickPose: PET.clickPose,
    })
  })
  const statusHint = $derived.by(() => {
    if (pose === 'listen') return t('chat.leoPetStatusListen')
    if (pose === 'speak') return t('chat.speaking')
    if (pose === 'think' || pose === 'busy' || pose === 'draw')
      return t('chat.leoPetStatusBusy')
    if (pose === 'sleep' || pose === 'yawn') return t('chat.leoPetStatusSleep')
    if (pose === 'soft') return t('chat.leoPetStatusSoft')
    return t('chat.leoPetHint')
  })

  // —— 台词气泡 / 抚摸 ——
  let quip = $state(/** @type {string | null} */ (null))
  let heartsBurst = $state(0)
  const quipBox = createLeoPetQuipBox((text) => {
    quip = text
  })
  const showQuip = quipBox.show
  const petting = createLeoPetPetting()
  /** @type {{ x: number, y: number } | null} */
  let hoverPrev = null
  // 桌宠本体拖动:按住起点 + 是否已进入拖窗口(startDragging 接管后置 true)
  /** @type {{ x: number, y: number } | null} */
  let petDownAt = null
  let petDragStarted = false

  function onHoverMove(e) {
    if (e.pointerType !== 'mouse') return
    if (hoverPrev) {
      const fired = petting.move(
        e.clientX - hoverPrev.x,
        e.clientY - hoverPrev.y,
        Date.now(),
      )
      if (fired) {
        triggerLeoPetClick('petted')
        heartsBurst++
        showQuip('petted')
      }
    }
    hoverPrev = { x: e.clientX, y: e.clientY }
  }

  function onHoverLeave() {
    hoverPrev = null
    petting.reset()
  }

  function onPetPointerDown(e) {
    if (e.button != null && e.button !== 0) return
    petDownAt = { x: e.clientX, y: e.clientY }
    petDragStarted = false
  }

  // 按住桌宠移动 >6px → 调 Tauri startDragging 拖整窗;纯点击(未拖)才在 up 里 onTap。
  // 桌宠本体既能移动窗口位置,也能点开主窗 —— 不再只靠顶部/侧边细条拖动。
  async function onPetPointerMove(e) {
    if (petDownAt && !petDragStarted) {
      const moved = Math.hypot(e.clientX - petDownAt.x, e.clientY - petDownAt.y)
      if (moved > 6) {
        petDragStarted = true
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          await getCurrentWindow().startDragging()
        } catch {
          petDragStarted = false // 非 Tauri(浏览器):回退,不阻断点击/抚摸
        }
        return
      }
      return
    }
    if (!petDownAt) onHoverMove(e)
  }

  function onPetPointerUp() {
    const wasDrag = petDragStarted
    petDownAt = null
    petDragStarted = false
    if (!wasDrag) void onTap()
  }

  function onSay() {
    menuOpen = false
    const shown = showQuip('say', {
      pick: () =>
        pickLeoPetSayQuip(new Date().getHours(), { lastId: quipBox.lastId() }),
    })
    triggerLeoPetClick(
      (shown && leoPetQuipPose(quipBox.lastId())) || 'wave',
      3600,
    )
  }

  async function onTap() {
    menuOpen = false
    if (PET.tucked) {
      setLeoPetTucked(false)
      publishLeoPetContext({ force: true })
      showQuip('wake')
      triggerLeoPetClick('smirk')
    } else {
      triggerLeoPetClick('happy')
    }
    bumpLeoPetActivity()
    requestLeoPetOpenAssistant()
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const main = await WebviewWindow.getByLabel('main')
      if (main) {
        await main.show()
        await main.unminimize?.()
        await main.setFocus()
      }
    } catch {
      /* browser preview */
    }
  }

  function onTuck() {
    menuOpen = false
    setLeoPetTucked(true)
    publishLeoPetContext({ force: true })
  }

  function onContextMenu(e) {
    e.preventDefault()
    menuOpen = true
    menuX = Math.min(e.clientX, window.innerWidth - 160)
    menuY = Math.min(e.clientY, window.innerHeight - 100)
  }

  onMount(() => {
    if (browser) {
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      pageHidden = document.hidden
    }
    preloadLeoPetAssets()
    const unbind = bindLeoPetCrossWindow({ asPetWindow: true })
    let unbindPos = () => {}
    void bindLeoPetWindowPosPersistence().then((fn) => {
      unbindPos = fn
    })

    const onVis = () => {
      pageHidden = document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    let idleAccum = 0
    const tick = setInterval(() => {
      nowTick++
      const animate = leoPetShouldAnimate({
        hidden: pageHidden,
        reducedMotion: prefersLeoPetReducedMotion(),
      })
      if (!animate || PET.remote) return
      idleAccum += 400
      const current = resolveLeoPetPose({
        streaming: Boolean(PET.remote?.streaming),
        toolRunning: Boolean(PET.remote?.toolRunning),
        imageGen: Boolean(PET.remote?.imageGen),
        speaking: PET.speaking,
        listening: PET.listening,
        softMode: Date.now() < PET.softUntil,
        idleMs: Date.now() - PET.lastActivityAt,
        clickRemainingMs: Math.max(0, PET.clickUntil - Date.now()),
        clickPose: PET.clickPose,
      })
      if (current === 'idle' && idleAccum >= LEO_PET_IDLE_TICK_MS) {
        idleAccum = 0
        PET.idleFrame = /** @type {0|1} */ (PET.idleFrame === 0 ? 1 : 0)
      }
    }, 400)

    return () => {
      unbind()
      unbindPos()
      clearInterval(tick)
      quipBox.dispose()
      document.removeEventListener('visibilitychange', onVis)
    }
  })

  // 主窗流式回答收尾(远端上下文过渡沿):happy + 完成台词
  let prevRemoteStreaming = false
  $effect(() => {
    const s = Boolean(PET.remote?.streaming)
    if (prevRemoteStreaming && !s) {
      untrack(() => {
        triggerLeoPetClick('celebrate')
        showQuip('stream_done')
      })
    }
    prevRemoteStreaming = s
  })
</script>

<svelte:head>
  <title>Leo</title>
</svelte:head>

<svelte:window
  onclick={() => {
    menuOpen = false
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') menuOpen = false
  }}
/>

{#if PET.tucked}
  <div class="pet-page tucked" data-testid="leo-pet-desktop-tucked">
    <button
      type="button"
      class="pet-wake"
      title={t('chat.leoPetWake')}
      aria-label={t('chat.leoPetWake')}
      onclick={onTap}
    >
      {t('chat.leoPetWake')}
    </button>
    <div class="pet-drag-top" data-tauri-drag-region aria-hidden="true"></div>
  </div>
{:else}
  <div class="pet-page" data-testid="leo-pet-desktop">
    <div class="pet-stage">
      <LeoPetSprite
        {pose}
        idleFrame={/** @type {0|1} */ (PET.idleFrame)}
        sizePx={160}
        {quip}
        bubbleAlign="center"
        {heartsBurst}
        onquipclick={() => void onTap()}
      />
      <button
        type="button"
        class="pet-hit"
        title={statusHint}
        aria-label={statusHint}
        data-pose={pose}
        data-persona={S.settings.assistantPersona}
        oncontextmenu={onContextMenu}
        onpointerdown={onPetPointerDown}
        onpointermove={onPetPointerMove}
        onpointerup={onPetPointerUp}
        onpointerleave={onHoverLeave}
      ></button>
    </div>
    <div class="pet-drag-top" data-tauri-drag-region aria-hidden="true"></div>
    <div class="pet-drag-side left" data-tauri-drag-region aria-hidden="true"></div>
    <div class="pet-drag-side right" data-tauri-drag-region aria-hidden="true"></div>
  </div>
{/if}

{#if menuOpen}
  <div
    class="pet-menu"
    style={`left:${menuX}px;top:${menuY}px`}
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') menuOpen = false
      e.stopPropagation()
    }}
  >
    <button type="button" role="menuitem" onclick={() => void onTap()}>
      {t('chat.leoPetMenuOpen')}
    </button>
    <button type="button" role="menuitem" onclick={onSay}>
      {t('chat.leoPetMenuSay')}
    </button>
    <button type="button" role="menuitem" onclick={onTuck}>
      {t('chat.leoPetMenuTuck')}
    </button>
  </div>
{/if}

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    overflow: hidden;
  }
  .pet-page {
    position: relative;
    width: 100vw;
    height: 100vh;
    display: grid;
    /* 桌宠靠窗口下部,上方整片留给气泡向上弹出(不被窗口顶裁掉) */
    place-items: end center;
    padding-bottom: 18px;
    background: transparent;
  }
  .pet-page.tucked {
    padding-bottom: 16px;
  }
  .pet-stage {
    position: relative;
    z-index: 1;
    width: 160px;
    height: 160px;
    /* 窗口 240px 宽,气泡收窄留边避免横向被裁 */
    --pet-bubble-max: 212px;
    transition: transform 160ms ease;
  }
  .pet-stage:hover {
    transform: translateY(-2px) scale(1.03);
  }
  .pet-hit {
    position: absolute;
    inset: 0;
    z-index: 2;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 50%;
    -webkit-tap-highlight-color: transparent;
  }
  .pet-wake {
    position: relative;
    z-index: 1;
    margin: 0 0 8px;
    padding: 8px 14px;
    border: 0;
    border-radius: 999px;
    background: rgba(28, 28, 30, 0.72);
    color: #f5f5f7;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    backdrop-filter: blur(10px);
  }
  .pet-menu {
    position: fixed;
    z-index: 5;
    min-width: 140px;
    padding: 6px;
    border-radius: 12px;
    background: rgba(28, 28, 30, 0.9);
    color: #f5f5f7;
    display: grid;
    gap: 2px;
  }
  .pet-menu button {
    margin: 0;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .pet-menu button:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  @media (prefers-reduced-motion: reduce) {
    .pet-stage,
    .pet-stage:hover {
      transition: none;
      transform: none;
    }
  }
  .pet-drag-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 28px;
    z-index: 2;
  }
  .pet-drag-side {
    position: absolute;
    top: 28px;
    bottom: 0;
    width: 18px;
    z-index: 2;
  }
  .pet-drag-side.left {
    left: 0;
  }
  .pet-drag-side.right {
    right: 0;
  }
</style>
