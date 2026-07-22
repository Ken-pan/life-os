<script>
  import { tick, untrack, onMount, onDestroy } from 'svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t, localeTag } from '$lib/i18n/index.js'
  import { S } from '$lib/state.svelte.js'
  import {
    C,
    startNewChat,
    selectConversation,
    sendMessage,
    conversationToMarkdown,
  } from '$lib/chat.svelte.js'
  import Composer from '$lib/components/Composer.svelte'
  import Message from '$lib/components/Message.svelte'
  import AgentThread from '$lib/components/AgentThread.svelte'
  import { AG } from '$lib/agents.svelte.js'
  import ModelPicker from '$lib/components/ModelPicker.svelte'
  import SidePanel from '$lib/components/SidePanel.svelte'
  import { openArtifact } from '$lib/panel.svelte.js'
  import { CLOUD_BUILD } from '$lib/env.js'
  import { generateDailySuggestions } from '$lib/dailySuggestions.js'
  import {
    isPairedLocalAiGateway,
    isHeavyChatBusy,
    warmLocalAiAssist,
    warmLocalAiHeavy,
  } from '$lib/localai.js'
  import {
    isIosNativeShell,
    publishNavManifest,
  } from '$lib/kenos/iosNativeShell.js'
  import { FOCUS } from '$lib/kenos/focusStore.svelte.js'
  import { resolveAssistantScopeLabel } from '$lib/kenos/assistantScopeLabel.core.js'
  import {
    ASSISTANT_CTX,
    enterWorkAssistantContext,
    clearAssistantContext,
  } from '$lib/kenos/assistantContext.svelte.js'
  import {
    CONTROL,
    refreshControlCenter,
  } from '$lib/kenos/controlCenter.svelte.js'
  import {
    buildAssistantAttentionBrief,
    summarizeControlQueue,
  } from '$lib/kenos/controlCenter.core.js'
  import { resolveProductSessionState } from '$lib/kenos/productSessionState.core.js'
  import { CLOUD, isCloudAuthorized } from '$lib/cloud.svelte.js'
  import {
    ASSISTANT_LOCAL_MODE_KEY,
    resolveAssistantSurface,
    liveStateForAssistantSurface,
    conversationIdFromSearch,
    buildAssistantHref,
    buildAssistantNavManifest,
    composerPlaceholderKind,
    reconcileUrlToState,
    reconcileStateToUrl,
    readLocalModeAccepted,
  } from '$lib/kenos/assistantShell.core.js'

  const scopeUi = $derived(
    resolveAssistantScopeLabel({
      focus: FOCUS.focus,
      workContext: ASSISTANT_CTX.work
        ? { title: ASSISTANT_CTX.work.title || '' }
        : page.url.searchParams.get('scope') === 'work'
          ? { title: page.url.searchParams.get('entity') || '' }
          : null,
    }),
  )

  const chatHint = $derived.by(() => {
    if (!CLOUD_BUILD) {
      if (C.gatewayOk === false) return t('chat.hintLocalDown')
      if (isPairedLocalAiGateway()) return t('chat.hintLocalPaired')
      return t('chat.hintLocal')
    }
    if (C.chatBackend === 'kimi') return t('chat.hintCloudKimi')
    if (C.chatBackend === 'local' && C.gatewayOk) return t('chat.hintCloudLocal')
    return t('chat.hintCloud')
  })
  const composerAutofocus = $derived(!isIosNativeShell())

  $effect(() => {
    if (page.url.searchParams.get('scope') !== 'work') return
    enterWorkAssistantContext({
      title: page.url.searchParams.get('entity') || '',
    })
  })

  const conversation = $derived(
    C.conversations.find((c) => c.id === C.activeId) ?? null,
  )

  const queue = $derived(summarizeControlQueue(CONTROL))
  const session = $derived(
    resolveProductSessionState({
      cloudReady: CLOUD.ready,
      cloudUser: CLOUD.user,
      cloudAuthorized: isCloudAuthorized(),
      cloudSyncing: CLOUD.syncing,
      cloudLastSyncAt: CLOUD.lastSyncAt,
      controlLoading: CONTROL.loading,
      sources: CONTROL.sources,
    }),
  )

  // Sync read — avoids locked flash before onMount.
  let localModeAccepted = $state(
    browser ? readLocalModeAccepted(sessionStorage) : false,
  )

  const surface = $derived(
    resolveAssistantSurface({
      activeId: C.activeId,
      messageCount: conversation?.messages.length ?? 0,
      streaming: C.streaming,
      // Auth-only gate (not source permission_denied / CloudGate overlap).
      signedOut: Boolean(
        CLOUD_BUILD && session.authenticationState === 'signed_out',
      ),
      localModeAccepted,
    }),
  )
  const inConversation = $derived(surface === 'conversation')

  const attention = $derived(
    buildAssistantAttentionBrief({
      summary: CONTROL.summary,
      queue,
      session,
    }),
  )

  const STATIC_SUGGESTIONS = $derived([
    { icon: 'notebook', text: t('chat.suggestBrainstorm') },
    { icon: 'search', text: t('chat.suggestSearch') },
    { icon: 'lightbulb', text: t('chat.suggestCode') },
  ])
  const DYN_ICONS = ['notebook', 'search', 'lightbulb', 'code']
  let dynamicSuggestions = $state(/** @type {string[]|null} */ (null))
  onMount(() => {
    void refreshControlCenter()
    const runIdle = (fn) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(fn, { timeout: 2800 })
      } else {
        setTimeout(fn, 450)
      }
    }
    runIdle(() => {
      void warmLocalAiAssist().catch(() => {})
      void generateDailySuggestions()
        .then((items) => {
          if (items?.length) dynamicSuggestions = items
        })
        .catch(() => {})
      const warmHeavy = () => {
        if (isHeavyChatBusy()) return
        void warmLocalAiHeavy().catch(() => {})
      }
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(warmHeavy, { timeout: 6000 })
      } else {
        setTimeout(warmHeavy, 2200)
      }
    })
  })
  const suggestions = $derived.by(() => {
    if (attention.prompts.length) {
      return attention.prompts.map((text, i) => ({
        icon: DYN_ICONS[i % DYN_ICONS.length],
        text,
      }))
    }
    if (dynamicSuggestions?.length) {
      return dynamicSuggestions.slice(0, 3).map((text, i) => ({
        icon: DYN_ICONS[i % DYN_ICONS.length],
        text,
      }))
    }
    return STATIC_SUGGESTIONS.slice(0, 3)
  })

  const followUps = $derived.by(() => {
    if (C.streaming || !conversation) return []
    const last = conversation.messages.at(-1)
    if (last?.role !== 'assistant' || last.error) return []
    return (last.suggestions ?? []).slice(0, 2)
  })

  const recentChats = $derived(
    C.conversations
      .filter((c) => c.messages?.length)
      .slice(0, 5),
  )

  const homeGreeting = $derived.by(() => {
    const h = new Date().getHours()
    const en = S.settings.locale === 'en'
    const hi = en
      ? h < 12
        ? 'Good morning'
        : h < 18
          ? 'Good afternoon'
          : 'Good evening'
      : h < 12
        ? '上午好'
        : h < 18
          ? '下午好'
          : '晚上好'
    const email = CLOUD.user?.email || ''
    const raw = email.includes('@') ? email.split('@')[0] : ''
    // Skip opaque ids / numeric handles — greeting should feel human.
    const name =
      raw &&
      raw.length <= 18 &&
      !/^\d/.test(raw) &&
      /[a-zA-Z\u4e00-\u9fff]/.test(raw)
        ? raw
        : ''
    if (!name) return hi
    return en ? `${hi}, ${name}` : `${hi}，${name}`
  })

  const placeholderKind = $derived(
    surface === 'locked' ||
      (session.authenticationState === 'signed_out' && localModeAccepted)
      ? 'local'
      : composerPlaceholderKind(scopeUi.kind, scopeUi),
  )
  const composerPlaceholder = $derived(
    placeholderKind === 'work'
      ? t('chat.placeholderWork')
      : placeholderKind === 'local'
        ? t('chat.placeholderLocal')
        : t('chat.placeholderAll'),
  )
  const composerContextLabel = $derived(
    scopeUi.entity ? `${scopeUi.space} · ${scopeUi.entity}` : scopeUi.space,
  )
  const composerContextMeta = $derived(
    scopeUi.kind === 'context' ? t('chat.contextReadonly') : '',
  )

  let scroller = $state(null)
  let nearBottom = $state(true)
  let exported = $state(false)
  let moreOpen = $state(false)
  let moreBtn = $state(/** @type {HTMLButtonElement | null} */ (null))
  let moreMenu = $state(/** @type {HTMLElement | null} */ (null))
  /** @type {ReturnType<typeof setTimeout> | null} */
  let exportTimer = null
  /** Suppress state→URL while applying URL→state (history.back). */
  let applyingFromUrl = false

  let spacerH = $state(0)
  // Intentionally non-reactive bookkeeping for scroll-anchor (not UI state).
  let liveAnchor = false
  let prevId = null
  let prevLen = 0
  const TOP_GAP = 16

  function recomputeSpacer() {
    if (!scroller || !liveAnchor) {
      if (spacerH !== 0) spacerH = 0
      return
    }
    const col = scroller.firstElementChild
    if (!col) return
    const rows = col.querySelectorAll('[data-role]')
    let lastUser = null
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].getAttribute('data-role') === 'user') {
        lastUser = rows[i]
        break
      }
    }
    if (!lastUser) {
      if (spacerH !== 0) spacerH = 0
      return
    }
    const header = scroller.parentElement?.querySelector('.chat-top')
    const targetTop = (header?.offsetHeight ?? 56) + TOP_GAP
    const userOffset =
      lastUser.getBoundingClientRect().top - col.getBoundingClientRect().top
    const contentH = scroller.scrollHeight - spacerH
    const desired = scroller.clientHeight - targetTop + userOffset
    const next = Math.max(0, desired - contentH)
    if (Math.abs(next - spacerH) > 1) spacerH = next
  }

  function onScroll() {
    if (!scroller) return
    nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140
  }

  function scrollToBottom() {
    nearBottom = true
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }

  function onResize() {
    if (!liveAnchor) return
    untrack(() => recomputeSpacer())
    if (nearBottom) scroller?.scrollTo({ top: scroller.scrollHeight })
  }

  async function exportConversation() {
    if (!conversation) return
    try {
      await navigator.clipboard.writeText(conversationToMarkdown(conversation))
      exported = true
      moreOpen = false
      if (exportTimer) clearTimeout(exportTimer)
      exportTimer = setTimeout(() => {
        exported = false
        exportTimer = null
      }, 1500)
    } catch {
      /* ignore */
    }
  }

  function syncAssistantUrl(conversationId) {
    const next = buildAssistantHref({
      pathname: page.url.pathname || '/assistant',
      conversationId,
      currentSearch: page.url.search,
    })
    const cur = `${page.url.pathname}${page.url.search}`
    if (cur === next) return
    void goto(next, { replaceState: true, noScroll: true, keepFocus: true })
  }

  function returnHome() {
    moreOpen = false
    applyingFromUrl = true
    startNewChat()
    syncAssistantUrl(null)
    queueMicrotask(() => {
      applyingFromUrl = false
    })
  }

  function openHistory() {
    moreOpen = false
    void goto('/history')
  }

  function openRecent(id) {
    selectConversation(id)
    syncAssistantUrl(id)
  }

  function acceptLocalMode() {
    localModeAccepted = true
    try {
      sessionStorage.setItem(ASSISTANT_LOCAL_MODE_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  function clearScope() {
    clearAssistantContext()
    const next = buildAssistantHref({
      pathname: page.url.pathname || '/assistant',
      conversationId: inConversation ? C.activeId : null,
      scope: null,
      currentSearch: page.url.search,
    })
    void goto(next, { replaceState: true, noScroll: true, keepFocus: true })
  }

  function formatRecentTime(ts) {
    const date = new Date(ts)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(localeTag(), {
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    return date.toLocaleDateString(localeTag(), {
      month: 'short',
      day: 'numeric',
    })
  }

  function publishShellManifest() {
    if (!isIosNativeShell()) return
    const live = liveStateForAssistantSurface(surface)
    const path = `${page.url.pathname}${page.url.search}`
    void publishNavManifest(
      buildAssistantNavManifest({
        path,
        title: inConversation
          ? conversation?.title || t('chat.title')
          : t('chat.homeTitle'),
        liveState: live,
        canGoBack: inConversation,
        conversationId: C.activeId || '',
        summary: inConversation
          ? conversation?.title || t('chat.title')
          : t('chat.homeTitle'),
      }),
    )
  }

  // URL is source of truth for open chat (supports history.back / WK goBack).
  $effect(() => {
    const fromUrl = conversationIdFromSearch(page.url.searchParams)
    const action = reconcileUrlToState({
      urlConversationId: fromUrl,
      activeId: C.activeId,
      messageCount: conversation?.messages.length ?? 0,
      streaming: C.streaming,
      conversationExists: Boolean(
        fromUrl && C.conversations.some((c) => c.id === fromUrl),
      ),
    })
    if (action === 'noop') return
    applyingFromUrl = true
    if (action === 'select' && fromUrl) selectConversation(fromUrl)
    else if (action === 'clear') startNewChat()
    else if (action === 'clear-url') syncAssistantUrl(null)
    queueMicrotask(() => {
      applyingFromUrl = false
    })
  })

  // Mirror UI-owned changes into URL — never fight history.back.
  $effect(() => {
    if (applyingFromUrl) return
    const id = C.activeId
    const urlId = conversationIdFromSearch(page.url.searchParams)
    const action = reconcileStateToUrl({
      activeId: id,
      urlConversationId: urlId,
      messageCount: conversation?.messages.length ?? 0,
      streaming: C.streaming,
    })
    if (action === 'set') syncAssistantUrl(id)
    else if (action === 'clear') syncAssistantUrl(null)
  })

  // Native dock hide contract
  $effect(() => {
    void surface
    void C.activeId
    void conversation?.title
    void page.url.pathname
    void page.url.search
    publishShellManifest()
  })

  $effect(() => {
    if (!inConversation && moreOpen) moreOpen = false
  })

  // More menu: click-outside + Escape (match Composer + menu).
  $effect(() => {
    if (!moreOpen) return
    const onDocClick = (e) => {
      if (
        !moreMenu?.contains(/** @type {Node} */ (e.target)) &&
        !moreBtn?.contains(/** @type {Node} */ (e.target))
      ) {
        moreOpen = false
      }
    }
    const onDocKey = (e) => {
      if (e.key === 'Escape') {
        moreOpen = false
        moreBtn?.focus()
      }
    }
    document.addEventListener('pointerdown', onDocClick, true)
    document.addEventListener('keydown', onDocKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDocClick, true)
      document.removeEventListener('keydown', onDocKey, true)
    }
  })

  onDestroy(() => {
    if (exportTimer) clearTimeout(exportTimer)
    if (!isIosNativeShell()) return
    void publishNavManifest(
      buildAssistantNavManifest({
        path: '/assistant',
        title: t('chat.homeTitle'),
        liveState: 'idle',
        canGoBack: false,
      }),
    )
  })

  $effect(() => {
    const id = C.activeId
    const conv = C.conversations.find((c) => c.id === id) ?? null
    const len = conv?.messages.length ?? 0
    const last = conv?.messages.at(-1)
    void last?.content
    void last?.reasoning
    void last?.suggestions
    if (!scroller) return

    if (id !== prevId) {
      prevId = id
      prevLen = len
      liveAnchor = false
      spacerH = 0
      nearBottom = true
      tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
      return
    }

    if (len > prevLen) {
      liveAnchor = true
      nearBottom = true
    }
    prevLen = len

    if (!nearBottom) return
    untrack(() => recomputeSpacer())
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
  })

  let wasStreaming = false
  $effect(() => {
    const streaming = C.streaming
    if (wasStreaming && !streaming && liveAnchor && nearBottom) {
      liveAnchor = false
      spacerH = 0
      tick().then(() =>
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }),
      )
    }
    wasStreaming = streaming
  })

  $effect(() => {
    const fresh = C.freshAssistant
    if (!fresh || fresh.id !== C.activeId) return
    C.freshAssistant = null
    const message = conversation?.messages[fresh.index]
    if (!message) return
    const match = message.content.match(/```(html|svg)\s*\n([\s\S]*?)```/)
    if (match && match[2].length > 300) {
      openArtifact({
        lang: match[1],
        code: match[2],
        title: conversation.title,
      })
    }
  })
</script>

<svelte:window onresize={onResize} />

<div class="chat" data-surface={surface} data-testid="assistant-shell">
  <div class="chat-main">
    {#if AG.active}
      <AgentThread />
    {:else}
      <header class="chat-top" data-testid="assistant-top">
        <div class="chat-top-left">
          {#if inConversation}
            <button
              type="button"
              class="top-btn top-btn--back"
              title={t('chat.backToHome')}
              aria-label={t('chat.backToHome')}
              onclick={returnHome}
            >
              <Icon name="chevron-left" size={18} strokeWidth={2} />
            </button>
            <p class="chat-title" aria-live="polite">
              {conversation?.title || t('chat.title')}
            </p>
          {:else}
            <p class="chat-title chat-title--home">{t('chat.homeTitle')}</p>
          {/if}
        </div>
        <div class="chat-top-right">
          <div
            class="chat-top-actions"
            role="toolbar"
            aria-label={inConversation ? t('chat.title') : t('chat.homeTitle')}
          >
            <button
              type="button"
              class="top-btn"
              title={t('nav.history')}
              aria-label={t('nav.history')}
              onclick={openHistory}
            >
              <Icon name="history" size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              class="top-btn"
              title={t('chat.newChat')}
              aria-label={t('chat.newChat')}
              onclick={returnHome}
            >
              <Icon name="compose" size={15} strokeWidth={1.75} />
            </button>
            {#if inConversation}
              <button
                bind:this={moreBtn}
                type="button"
                class="top-btn"
                title={t('chat.moreActions')}
                aria-label={t('chat.moreActions')}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-controls="assistant-more-panel"
                onclick={() => (moreOpen = !moreOpen)}
              >
                <Icon name="more-horizontal" size={15} strokeWidth={1.75} />
              </button>
            {/if}
          </div>
          {#if moreOpen && inConversation}
            <div
              bind:this={moreMenu}
              id="assistant-more-panel"
              class="more-menu"
              role="dialog"
              aria-label={t('chat.moreActions')}
            >
              <div class="more-model">
                <ModelPicker />
              </div>
              <button
                type="button"
                class="more-item"
                onclick={exportConversation}
              >
                <Icon
                  name={exported ? 'check' : 'download'}
                  size={15}
                  strokeWidth={1.75}
                />
                <span>{exported ? t('chat.exported') : t('chat.export')}</span>
              </button>
            </div>
          {/if}
        </div>
      </header>

      {#if surface === 'locked'}
        <div class="hero hero--locked" data-testid="assistant-locked">
          <h2 class="locked-title">{t('chat.lockedTitle')}</h2>
          <p class="locked-body">{t('chat.lockedBody')}</p>
          <div class="locked-actions">
            <a href="/settings#cloud" class="btn-primary">
              {t('chat.lockedConnect')}
            </a>
            <button
              type="button"
              class="btn-secondary"
              onclick={acceptLocalMode}
            >
              {t('chat.lockedLocal')}
            </button>
          </div>
        </div>
      {:else if !inConversation}
        <div class="hero hero--home" data-testid="assistant-home">
          <h1 class="home-greeting">{homeGreeting}</h1>
          <section
            class="attention-brief"
            aria-label={t('chat.attentionLabel')}
          >
            <p class="attention-ask">{attention.ask}</p>
            {#if attention.bullets.length}
              <ul class="attention-list">
                {#each attention.bullets as bullet (bullet)}
                  <li>{bullet}</li>
                {/each}
              </ul>
            {/if}
          </section>
          <div class="suggestions" aria-label={t('chat.suggestionsLabel')}>
            <p class="suggestions-label">{t('chat.suggestionsLabel')}</p>
            {#each suggestions as item (item.text)}
              <button
                type="button"
                class="assistant-chip"
                onclick={() => sendMessage(item.text)}
              >
                <Icon name={item.icon} size={14} strokeWidth={1.75} />
                <span>{item.text}</span>
              </button>
            {/each}
          </div>
          {#if recentChats.length}
            <section
              class="recent"
              aria-label={t('chat.recentChats')}
              data-testid="assistant-recent"
            >
              <p class="suggestions-label">{t('chat.recentChats')}</p>
              {#each recentChats as item (item.id)}
                <button
                  type="button"
                  class="recent-row"
                  onclick={() => openRecent(item.id)}
                >
                  <span class="recent-title"
                    >{item.title || t('chat.newChat')}</span
                  >
                  <span class="recent-time"
                    >{formatRecentTime(item.updatedAt)}</span
                  >
                </button>
              {/each}
            </section>
          {/if}
          <p class="hint hint--empty">{chatHint}</p>
          <p class="hint hint--trust">{t('chat.emptyTrust')}</p>
        </div>
        <div class="dock dock--home">
          <div class="dock-col">
            <Composer
              autofocus={composerAutofocus}
              placeholder={composerPlaceholder}
              contextLabel={composerContextLabel}
              contextMeta={composerContextMeta}
              onClearContext={scopeUi.kind === 'context' ? clearScope : undefined}
            />
          </div>
        </div>
      {:else}
        <div
          class="thread aios-scroll"
          bind:this={scroller}
          onscroll={onScroll}
          data-testid="assistant-thread"
        >
          <div class="thread-col">
            {#each conversation.messages as message, i (message.id || `${message.role}-${i}`)}
              <Message
                {message}
                index={i}
                isLast={i === conversation.messages.length - 1}
              />
            {/each}
            {#if followUps.length}
              <div class="follow-ups" aria-label={t('chat.followUps')}>
                {#each followUps as text (text)}
                  <button
                    type="button"
                    class="follow-chip"
                    onclick={() => sendMessage(text)}
                  >
                    <span>{text}</span>
                  </button>
                {/each}
              </div>
            {/if}
            <div
              class="thread-spacer"
              aria-hidden="true"
              style:height="{spacerH}px"
            ></div>
          </div>
        </div>
        <div class="dock dock--conversation">
          <div class="dock-col">
            {#if !nearBottom}
              <button
                type="button"
                class="to-bottom"
                title={t('chat.scrollToBottom')}
                aria-label={t('chat.scrollToBottom')}
                onclick={scrollToBottom}
              >
                <Icon name="arrow-down" size={16} strokeWidth={2} />
              </button>
            {/if}
            <Composer
              placeholder={composerPlaceholder}
              contextLabel={composerContextLabel}
              contextMeta={composerContextMeta}
              onClearContext={scopeUi.kind === 'context' ? clearScope : undefined}
            />
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <SidePanel />
</div>

<style>
  .chat {
    height: 100%;
    display: flex;
    flex-direction: row;
    min-height: 0;
  }

  .chat-main {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .chat-top {
    position: absolute;
    inset: 0 0 auto 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: calc(var(--safe-top-effective, 0px) + 10px)
      var(--kenos-chrome-inline, 16px) var(--kenos-chrome-header-pad-bottom, 8px);
    pointer-events: none;
    background: color-mix(in srgb, var(--bg) 96%, transparent);
    backdrop-filter: blur(18px) saturate(1.2);
    -webkit-backdrop-filter: blur(18px) saturate(1.2);
    border-bottom: 1px solid color-mix(in srgb, var(--t1) 6%, transparent);
  }
  .chat-top > :global(*) {
    pointer-events: auto;
  }
  .chat-top-left {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .chat-top-right {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex: 0 0 auto;
  }
  .chat-title {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t1);
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .chat-title--home {
    padding-inline-start: 2px;
  }
  .chat-top-actions {
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 0;
    border-radius: var(--kenos-chrome-cluster-radius, 10px);
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1) 8%, transparent);
  }
  .top-btn {
    display: grid;
    place-items: center;
    width: max(44px, var(--kenos-chrome-control-h, 32px));
    height: max(44px, var(--kenos-chrome-control-h, 32px));
    min-width: 44px;
    min-height: 44px;
    border: none;
    border-radius: var(--kenos-chrome-control-radius, 8px);
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }
  .top-btn:hover {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
    color: var(--t1);
  }
  .top-btn--back {
    margin-inline-start: -8px;
  }

  .more-menu {
    position: absolute;
    top: calc(100% + 6px);
    inset-inline-end: 0;
    z-index: 30;
    min-width: 200px;
    padding: 8px;
    display: grid;
    gap: 6px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg) 94%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1) 10%, transparent);
    box-shadow: 0 10px 28px color-mix(in srgb, #000 18%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .more-model {
    padding: 2px;
  }
  .more-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--t1);
    font-size: 13px;
    cursor: pointer;
    text-align: start;
  }
  .more-item:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
  }

  .suggestions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    width: 100%;
    margin-top: 2px;
  }
  .suggestions-label {
    margin: 0 2px 2px;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .assistant-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    border: 1px solid color-mix(in srgb, var(--t1) 7%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--t1) 3%, transparent);
    color: color-mix(in srgb, var(--t1) 82%, var(--t2));
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.35;
    text-align: start;
    cursor: pointer;
  }
  .assistant-chip :global(svg:first-child) {
    flex: 0 0 auto;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
  }
  .assistant-chip span {
    min-width: 0;
    flex: 1;
  }
  .assistant-chip:hover {
    background: color-mix(in srgb, var(--t1) 6%, transparent);
    border-color: color-mix(in srgb, var(--t1) 12%, transparent);
    color: var(--t1);
  }

  .recent {
    display: grid;
    gap: 2px;
    width: 100%;
  }
  .recent-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 8px 4px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--t1);
    cursor: pointer;
    text-align: start;
  }
  .recent-row:hover {
    background: color-mix(in srgb, var(--t1) 5%, transparent);
  }
  .recent-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 550;
  }
  .recent-time {
    flex: 0 0 auto;
    font-size: 12px;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
  }

  .to-bottom {
    position: absolute;
    top: -44px;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid color-mix(in srgb, var(--t1) 10%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    color: var(--t1);
    cursor: pointer;
    z-index: 5;
  }

  .attention-brief {
    display: grid;
    gap: 6px;
    padding: 0 2px;
  }
  .attention-list {
    margin: 0;
    padding: 0 0 0 1.05rem;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-secondary, 14px);
    line-height: 1.45;
  }
  .attention-list li {
    margin: 0 0 4px;
  }
  .attention-ask {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-body, 15px);
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .home-greeting {
    margin: 0 2px;
    color: var(--t1);
    font-size: 22px;
    font-weight: 700;
    /* Geist-first stacks clip PingFang fallback glyphs at tight line-height. */
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      'PingFang SC',
      'Hiragino Sans GB',
      'Noto Sans SC',
      system-ui,
      sans-serif;
    letter-spacing: 0;
    line-height: 1.4;
    overflow: visible;
    padding-block: 2px;
  }
  h1.home-greeting {
    font-size: 22px;
  }
  :global(html[lang='en']) .home-greeting {
    letter-spacing: -0.02em;
  }

  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 16px;
    width: min(100% - 32px, 680px);
    margin-inline: auto;
    padding: calc(var(--safe-top-effective, 0px) + 56px) 0 3vh;
    overflow-y: auto;
    min-height: 0;
  }
  .hero--locked {
    justify-content: center;
    gap: 12px;
    text-align: start;
  }
  .locked-title {
    margin: 0;
    color: var(--t1);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .locked-body {
    margin: 0;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: 15px;
    line-height: 1.45;
  }
  .locked-actions {
    display: grid;
    gap: 10px;
    margin-top: 8px;
  }
  .btn-primary,
  .btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .btn-primary {
    border: 0;
    background: var(--accent, #3b82f6);
    color: #fff;
  }
  .btn-secondary {
    border: 1px solid color-mix(in srgb, var(--t1) 12%, transparent);
    background: transparent;
    color: var(--t1);
  }

  .thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .thread-col {
    width: min(100% - 32px, 680px);
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding-block: calc(var(--safe-top-effective, 0px) + 60px) 12px;
  }
  .thread-spacer {
    flex: 0 0 auto;
    margin-top: -28px;
  }

  .follow-ups {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .follow-chip {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    max-width: 100%;
    border: 1px solid color-mix(in srgb, var(--t1) 10%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--t1) 4%, transparent);
    color: var(--t2);
    padding: 7px 12px;
    font-size: 13px;
    line-height: 1.3;
    text-align: start;
    cursor: pointer;
  }
  .follow-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .follow-chip:hover {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
    color: var(--t1);
  }

  .dock {
    flex: 0 0 auto;
    background: linear-gradient(
      to top,
      var(--bg) 70%,
      color-mix(in srgb, var(--bg) 42%, transparent) 92%,
      transparent
    );
  }
  .dock-col {
    position: relative;
    width: min(100% - 32px, 680px);
    margin-inline: auto;
    padding-bottom: max(8px, var(--safe-bottom, 0px));
    transition: padding-bottom 160ms ease;
  }
  /*
   * iOS native Daily Beta: WK is full-bleed under Liquid Glass dock.
   * Pinned composer must clear dock itself. Native updates
   * --kenos-dock-scroll-end-pad (78 tabs / 8 conversation).
   */
  :global(html[data-ios-native-shell='true'] .dock-col) {
    /*
     * Full-bleed WK often reports env(safe-area-inset-bottom)=0.
     * Prefer native-injected --kenos-native-safe-bottom; floor at 34px
     * so Home composer clears home indicator + Liquid Glass dock.
     */
    padding-bottom: calc(
      max(
          var(--kenos-native-safe-bottom, 0px),
          env(safe-area-inset-bottom, 0px),
          34px
        ) + var(--kenos-dock-scroll-end-pad, 78px) + 8px
    );
  }

  .hint {
    margin: 4px 0 0;
    text-align: start;
    font-size: var(--kenos-type-meta, 12px);
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
  }
  .hint--empty {
    margin-top: 4px;
    font-size: var(--kenos-type-secondary, 13px);
    line-height: 1.4;
  }
  .hint--trust {
    margin-top: 2px;
    font-size: var(--kenos-type-meta, 12px);
    opacity: 0.9;
  }

  /* Native shell already pads #main-content (~54px status bar). Do not stack env(safe-area). */
  :global(html[data-ios-native-shell='true'] .chat-top) {
    padding: 8px var(--kenos-chrome-inline, 16px) 10px;
    /* Solid bar — translucent + backdrop-filter ghosts the greeting under Home. */
    background: var(--bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-bottom-color: color-mix(in srgb, var(--t1) 8%, transparent);
  }
  :global(html[data-ios-native-shell='true'] .hero) {
    gap: 12px;
    /* Clear absolute .chat-top (~48px) + 8px air so greeting never sits under the bar. */
    padding: 72px 0 16px;
  }
  :global(html[data-ios-native-shell='true'] .thread-col) {
    gap: 24px;
    padding-block: 56px 10px;
  }
  /* macOS native: sidebar + titlebar — no phone dock / home-indicator pads. */
  :global(html[data-mac-native-shell='true'] .dock-col) {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px));
  }
  :global(html[data-mac-native-shell='true'] .hero) {
    padding: 28px 0 16px;
  }
  :global(html[data-mac-native-shell='true'] .thread-col) {
    padding-block: 20px 10px;
  }
  :global(html[data-ios-native-shell='true'] .chat-top-actions) {
    background: color-mix(in srgb, #fff 12%, transparent);
    border-color: color-mix(in srgb, #fff 16%, transparent);
  }
  :global(html[data-ios-native-shell='true'] .assistant-chip) {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, #fff 12%, transparent);
    background: color-mix(in srgb, #fff 6%, transparent);
  }
  :global(
      html[data-ios-native-shell='true'][data-theme='light'] .assistant-chip
    ),
  :global(
      html[data-ios-native-shell='true']:not([data-theme='dark'])
        .assistant-chip
    ) {
    border-color: color-mix(in srgb, var(--t1) 8%, transparent);
    background: color-mix(in srgb, var(--t1) 3.5%, transparent);
  }
  :global(
      html[data-ios-native-shell='true'][data-theme='light'] .chat-top-actions
    ),
  :global(
      html[data-ios-native-shell='true']:not([data-theme='dark'])
        .chat-top-actions
    ) {
    background: color-mix(in srgb, var(--card, #fff) 82%, transparent);
    border-color: color-mix(in srgb, var(--t1) 10%, transparent);
  }
</style>
