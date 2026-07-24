<script>
  import { onMount, untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { S, save } from '$lib/state.svelte.js'
  import { C, activeConversation } from '$lib/chat.svelte.js'
  import { IMG } from '$lib/imageProgress.svelte.js'
  import {
    LEO_PET_IDLE_TICK_MS,
    cycleLeoPetSize,
    leoPetShouldAnimate,
    leoPetShouldShow,
    leoPetSizePx,
    normalizeLeoPetPosition,
    normalizeLeoPetSize,
    resolveLeoPetPose,
  } from '$lib/kenos/leoPet.core.js'
  import {
    LEO_PET_AMBIENT_AFTER_MS,
    LEO_PET_AMBIENT_CHANCE,
    createLeoPetPetting,
    createLeoPetQuipBox,
    leoPetGreetTrigger,
    leoPetQuipPose,
    pickLeoPetSayQuip,
  } from '$lib/kenos/leoPetQuips.core.js'
  import LeoPetSprite from '$lib/components/LeoPetSprite.svelte'
  import {
    PET,
    bumpLeoPetActivity,
    prefersLeoPetReducedMotion,
    preloadLeoPetAssets,
    publishLeoPetContext,
    requestLeoPetOpenAssistant,
    setLeoPetTucked,
    triggerLeoPetClick,
  } from '$lib/kenos/leoPet.svelte.js'
  import { isIosNativeShell } from '$lib/kenos/iosNativeShell.js'
  import { t } from '$lib/i18n/index.js'
  import {
    syncLeoPetDesktopWindow,
    isTauriRuntime,
  } from '$lib/kenos/leoPetDesktop.js'

  /** 独立 /pet 路由自己渲染；助理页已有立牌，浮层会挡输入抢戏 */
  const isPetRoute = $derived(page.url.pathname === '/pet')
  const isAssistantRoute = $derived(page.url.pathname === '/assistant')
  const desktopOn = $derived(
    isTauriRuntime() && S.settings.leoPetDesktop === true,
  )
  const sizePx = $derived(leoPetSizePx(S.settings.leoPetSize))
  const baseShow = $derived(
    !isPetRoute &&
      !isAssistantRoute &&
      leoPetShouldShow(S.settings) &&
      !isIosNativeShell() &&
      !desktopOn,
  )
  const showPet = $derived(baseShow && !PET.tucked)
  const showWakeChip = $derived(baseShow && PET.tucked)

  /** 本机生图单独成态(draw 帧);其余工具仍走 busy */
  const imageGen = $derived(Boolean(IMG.active))
  const toolRunning = $derived.by(() => {
    const msgs = activeConversation()?.messages ?? []
    const last = msgs.at(-1)
    return Boolean(last?.toolCalls?.some((tc) => tc.running))
  })

  let nowTick = $state(0)
  let pageHidden = $state(false)
  let hovering = $state(false)
  let viewportH = $state(
    typeof window !== 'undefined' ? window.innerHeight : 800,
  )
  let menuOpen = $state(false)
  let menuX = $state(0)
  let menuY = $state(0)

  const pose = $derived.by(() => {
    void nowTick
    return resolveLeoPetPose({
      streaming: C.streaming,
      toolRunning,
      imageGen,
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

  let pos = $state(normalizeLeoPetPosition(S.settings.leoPetPosition))
  let dragging = $state(false)
  let dragOrigin = { x: 0, y: 0, right: 0, bottom: 0 }
  let moved = false

  // 桌宠顶部距视口顶不足一个气泡高度时,气泡改往下弹,避免超出屏顶被裁
  const bubblePlacement = $derived(
    viewportH - pos.bottom - sizePx < 96 ? 'down' : 'up',
  )

  // —— 台词气泡 / 抚摸 / 落地回弹 ——
  let quip = $state(/** @type {string | null} */ (null))
  let heartsBurst = $state(0)
  let dropSignal = $state(0)
  let greeted = false
  const quipBox = createLeoPetQuipBox((text) => {
    quip = text
  })
  const showQuip = quipBox.show
  const petting = createLeoPetPetting()
  /** @type {{ x: number, y: number } | null} */
  let hoverPrev = null

  function onPetted() {
    triggerLeoPetClick('petted')
    heartsBurst++
    showQuip('petted')
    publishNow(true)
  }

  function onSay() {
    closeMenu()
    const shown = showQuip('say', {
      pick: () =>
        pickLeoPetSayQuip(new Date().getHours(), { lastId: quipBox.lastId() }),
    })
    // 姿势跟台词语境走(咖啡/摇杯/做饭/伸懒腰…),没配到就挥手
    triggerLeoPetClick(
      (shown && leoPetQuipPose(quipBox.lastId())) || 'wave',
      3600,
    )
    publishNow(true)
  }

  function onCycleSize() {
    closeMenu()
    S.settings.leoPetSize = cycleLeoPetSize(S.settings.leoPetSize)
    save()
    bumpLeoPetActivity()
  }

  function viewportBounds() {
    if (typeof window === 'undefined') return {}
    const pad = sizePx + 8
    return {
      maxRight: Math.max(8, window.innerWidth - pad),
      maxBottom: Math.max(8, window.innerHeight - pad),
    }
  }

  function persistPos() {
    S.settings.leoPetPosition = { right: pos.right, bottom: pos.bottom }
    save()
  }

  function closeMenu() {
    menuOpen = false
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return
    closeMenu()
    dragging = true
    moved = false
    dragOrigin = {
      x: e.clientX,
      y: e.clientY,
      right: pos.right,
      bottom: pos.bottom,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e) {
    if (!dragging) {
      // hover 抚摸:鼠标在身上来回划(非按住拖动)累计距离 → happy + 爱心
      if (e.pointerType === 'mouse') {
        if (hoverPrev) {
          const fired = petting.move(
            e.clientX - hoverPrev.x,
            e.clientY - hoverPrev.y,
            Date.now(),
          )
          if (fired) onPetted()
        }
        hoverPrev = { x: e.clientX, y: e.clientY }
      }
      return
    }
    const dx = e.clientX - dragOrigin.x
    const dy = e.clientY - dragOrigin.y
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true
    pos = normalizeLeoPetPosition(
      {
        right: dragOrigin.right - dx,
        bottom: dragOrigin.bottom - dy,
      },
      viewportBounds(),
    )
  }

  function onPointerUp() {
    if (!dragging) return
    dragging = false
    persistPos()
    if (!moved) {
      void onTap()
    } else {
      dropSignal++
    }
  }

  function onContextMenu(e) {
    e.preventDefault()
    menuOpen = true
    menuX = e.clientX
    menuY = e.clientY
  }

  async function onTap() {
    closeMenu()
    triggerLeoPetClick('wave')
    bumpLeoPetActivity()
    publishNow(true)
    if (page.url.pathname !== '/assistant') {
      await goto(resolve('/assistant'))
    }
    requestLeoPetOpenAssistant()
  }

  function onTuck() {
    closeMenu()
    setLeoPetTucked(true)
    publishNow(true)
  }

  function onWake() {
    setLeoPetTucked(false)
    triggerLeoPetClick('smirk')
    showQuip('wake')
    publishNow(true)
  }

  function currentToolRunning() {
    return Boolean(
      activeConversation()?.messages
        ?.at(-1)
        ?.toolCalls?.some((tc) => tc.running),
    )
  }

  /** @param {boolean} [force] */
  function publishNow(force = false) {
    publishLeoPetContext({
      streaming: C.streaming,
      toolRunning: currentToolRunning(),
      imageGen: IMG.active,
      force,
    })
  }

  onMount(() => {
    preloadLeoPetAssets()
    pos = normalizeLeoPetPosition(S.settings.leoPetPosition, viewportBounds())
    pageHidden = document.hidden
    viewportH = window.innerHeight
    const onVis = () => {
      pageHidden = document.hidden
    }
    const onResize = () => {
      viewportH = window.innerHeight
      pos = normalizeLeoPetPosition(pos, viewportBounds())
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', onResize)

    let idleAccum = 0
    const tick = setInterval(() => {
      nowTick++
      const tools = currentToolRunning()
      const animate = leoPetShouldAnimate({
        hidden: pageHidden,
        reducedMotion: prefersLeoPetReducedMotion(),
      })
      if (animate) {
        idleAccum += 400
        const current = resolveLeoPetPose({
          streaming: C.streaming,
          toolRunning: tools,
          imageGen: IMG.active,
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
        // 闲置搭话:够久没动静后小概率出一句(受全局长冷却),配伸懒腰
        if (
          showPet &&
          current === 'idle' &&
          Date.now() - PET.lastActivityAt >= LEO_PET_AMBIENT_AFTER_MS &&
          Math.random() < LEO_PET_AMBIENT_CHANCE &&
          showQuip('idle_ambient')
        ) {
          triggerLeoPetClick('stretch', 3600)
        }
      }
      publishLeoPetContext({
        streaming: C.streaming,
        toolRunning: tools,
        imageGen: IMG.active,
      })
    }, 400)

    void syncLeoPetDesktopWindow(S.settings)
    publishNow(true)

    return () => {
      clearInterval(tick)
      quipBox.dispose()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
    }
  })

  // 首次露面:按时段打一声招呼(会话内只一次),配语境姿势(咖啡/摇杯/做饭)
  $effect(() => {
    if (!showPet || greeted) return
    greeted = true
    untrack(() => {
      setTimeout(() => {
        const trigger = leoPetGreetTrigger(new Date().getHours())
        if (showQuip(trigger)) {
          const pose = leoPetQuipPose(trigger)
          if (pose) triggerLeoPetClick(pose, 3600)
          publishNow(true)
        }
      }, 900)
    })
  })

  // 流式回答收尾:happy + 「Done. Come look.」(只在浮层可见时)
  let prevStreaming = false
  $effect(() => {
    const s = C.streaming
    if (prevStreaming && !s) {
      untrack(() => {
        if (showPet) {
          triggerLeoPetClick('celebrate')
          showQuip('stream_done')
          publishNow(true)
        }
      })
    }
    prevStreaming = s
  })

  // 回答出错:挠头道歉 + 一句「我的锅」台词(每个新错误只触发一次)
  let prevErrorKey = ''
  $effect(() => {
    const msgs = activeConversation()?.messages ?? []
    const last = msgs.at(-1)
    const key =
      last?.role === 'assistant' && last?.error
        ? `${msgs.length}:${String(last.error).slice(0, 40)}`
        : ''
    if (key && key !== prevErrorKey) {
      untrack(() => {
        if (showPet) {
          triggerLeoPetClick('oops', 3600)
          showQuip('oops')
          publishNow(true)
        }
      })
    }
    prevErrorKey = key
  })

  // 进入 soft(aftercare)姿势时给一句安抚
  let prevPose = 'idle'
  $effect(() => {
    const p = pose
    if (p !== prevPose) {
      prevPose = p
      if (p === 'soft') untrack(() => void showQuip('soft'))
    }
  })

  $effect(() => {
    void S.settings.leoPetEnabled
    void S.settings.leoPetDesktop
    void S.settings.assistantPersona
    if (
      S.settings.assistantPersona === 'leo' ||
      (isTauriRuntime() && S.settings.leoPetDesktop === true)
    ) {
      void syncLeoPetDesktopWindow(S.settings)
    }
  })

  $effect(() => {
    // 只跟踪 streaming/toolRunning/imageGen 的开关沿;内部 bump 会写 PET.lastActivityAt,
    // 而 publishNow 又读它 —— 不 untrack 会形成效果自循环(流式期间毫秒级重跑)。
    const active = C.streaming || toolRunning || imageGen
    if (!active) return
    untrack(() => {
      bumpLeoPetActivity()
      publishNow()
    })
  })

  $effect(() => {
    void PET.listening
    void PET.softUntil
    void PET.clickUntil
    void PET.clickPose
    void PET.idleFrame
    void PET.tucked
    publishNow()
  })
</script>

<svelte:window
  onclick={() => {
    if (menuOpen) closeMenu()
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') closeMenu()
  }}
/>

{#if showWakeChip}
  <button
    type="button"
    class="leo-pet-wake"
    style={`--leo-pet-right:${pos.right}px;--leo-pet-bottom:${pos.bottom}px`}
    data-testid="leo-pet-wake"
    onclick={onWake}
  >
    {t('chat.leoPetWake')}
  </button>
{/if}

{#if showPet}
  <div
    class="leo-pet"
    class:dragging
    class:hovering
    style={`--leo-pet-right:${pos.right}px;--leo-pet-bottom:${pos.bottom}px;--leo-pet-size:${sizePx}px`}
    data-testid="leo-pet-overlay"
    data-pose={pose}
    data-size={normalizeLeoPetSize(S.settings.leoPetSize)}
  >
    <LeoPetSprite
      {pose}
      idleFrame={/** @type {0|1} */ (PET.idleFrame)}
      {sizePx}
      {quip}
      {bubblePlacement}
      {heartsBurst}
      {dropSignal}
      onquipclick={() => void onTap()}
    />
    <button
      type="button"
      class="leo-pet-hit"
      title={statusHint}
      aria-label={statusHint}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          void onTap()
        }
      }}
      oncontextmenu={onContextMenu}
      onpointerenter={() => {
        hovering = true
      }}
      onpointerleave={() => {
        hovering = false
        hoverPrev = null
        petting.reset()
      }}
    ></button>
  </div>
{/if}

{#if menuOpen}
  <div
    class="leo-pet-menu"
    style={`left:${menuX}px;top:${menuY}px`}
    role="menu"
    tabindex="-1"
    data-testid="leo-pet-menu"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') closeMenu()
      e.stopPropagation()
    }}
  >
    <button type="button" role="menuitem" onclick={() => void onTap()}>
      {t('chat.leoPetMenuOpen')}
    </button>
    <button type="button" role="menuitem" onclick={onSay}>
      {t('chat.leoPetMenuSay')}
    </button>
    <button type="button" role="menuitem" onclick={onCycleSize}>
      {t('chat.leoPetMenuSize')}
    </button>
    <button type="button" role="menuitem" onclick={onTuck}>
      {t('chat.leoPetMenuTuck')}
    </button>
  </div>
{/if}

<style>
  .leo-pet {
    position: fixed;
    z-index: 40;
    right: var(--leo-pet-right, 24px);
    bottom: calc(var(--leo-pet-bottom, 96px) + var(--safe-bottom-effective, 0px));
    width: var(--leo-pet-size, 120px);
    height: var(--leo-pet-size, 120px);
    pointer-events: none;
    transition:
      filter 200ms ease,
      transform 180ms ease,
      opacity 180ms ease;
  }
  .leo-pet.hovering:not(.dragging) {
    transform: translateY(-3px) scale(1.03);
  }
  .leo-pet.dragging {
    transform: scale(1.05);
    filter: drop-shadow(0 16px 30px rgba(0, 0, 0, 0.3));
  }
  /* 透明命中区叠在立绘上方;气泡在 sprite 内 z-index 更高仍可点 */
  .leo-pet-hit {
    pointer-events: auto;
    position: absolute;
    inset: 0;
    z-index: 2;
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: grab;
    -webkit-tap-highlight-color: transparent;
    border-radius: 50%;
    /* 触屏拖动走 pointer 事件,不让浏览器抢去滚动页面 */
    touch-action: none;
  }
  .leo-pet.dragging .leo-pet-hit {
    cursor: grabbing;
  }
  .leo-pet-hit:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--accent, #c48) 55%, transparent);
    outline-offset: 3px;
  }
  .leo-pet-wake {
    position: fixed;
    z-index: 40;
    right: var(--leo-pet-right, 24px);
    bottom: calc(var(--leo-pet-bottom, 96px) + var(--safe-bottom-effective, 0px));
    margin: 0;
    padding: 8px 12px;
    border: 1px solid color-mix(in oklab, var(--t1) 14%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--bg) 88%, transparent);
    color: var(--t1);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    backdrop-filter: blur(10px);
    box-shadow: 0 6px 18px color-mix(in oklab, var(--t1) 12%, transparent);
  }
  .leo-pet-menu {
    position: fixed;
    z-index: 60;
    min-width: 148px;
    padding: 6px;
    border-radius: 12px;
    border: 1px solid color-mix(in oklab, var(--t1) 12%, transparent);
    background: color-mix(in oklab, var(--bg) 94%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 32px color-mix(in oklab, var(--t1) 16%, transparent);
    display: grid;
    gap: 2px;
  }
  .leo-pet-menu button {
    margin: 0;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .leo-pet-menu button:hover,
  .leo-pet-menu button:focus-visible {
    background: color-mix(in oklab, var(--accent, #c48) 14%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .leo-pet.hovering,
    .leo-pet.dragging {
      transform: none;
    }
  }
</style>
