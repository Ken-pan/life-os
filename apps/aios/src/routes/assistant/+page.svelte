<script>
  import { tick, untrack, onMount } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { t } from '$lib/i18n/index.js'
  import {
    C,
    startNewChat,
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
  import { isIosNativeShell } from '$lib/kenos/iosNativeShell.js'
  import { page } from '$app/state'
  import { FOCUS } from '$lib/kenos/focusStore.svelte.js'
  import { resolveAssistantScopeLabel } from '$lib/kenos/assistantScopeLabel.core.js'
  import {
    ASSISTANT_CTX,
    enterWorkAssistantContext,
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

  // Soft Work context (ASSISTANT_CTX / ?scope=work) — not Focus/prod writes.
  // Global nav clears ASSISTANT_CTX; staying on /assistant with work ctx keeps Scope: Work.
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
  const isEmpty = $derived(!conversation || conversation.messages.length === 0)

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
  const attention = $derived(
    buildAssistantAttentionBrief({
      summary: CONTROL.summary,
      queue,
      session,
    }),
  )

  // Prefer Kenos steward prompts from Today/Inbox/Training; fall back to daily / static.
  const STATIC_SUGGESTIONS = $derived([
    { icon: 'notebook', text: t('chat.suggestBrainstorm') },
    { icon: 'search', text: t('chat.suggestSearch') },
    { icon: 'lightbulb', text: t('chat.suggestCode') },
  ])
  const DYN_ICONS = ['notebook', 'search', 'lightbulb', 'code']
  let dynamicSuggestions = $state(/** @type {string[]|null} */ (null))
  onMount(() => {
    void refreshControlCenter()
    // Idle: warm 4B + daily chips — never compete with the user's first Ask turn.
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
      // After tiny + chips settle: nudge 35B so the first Ask avoids cold TTL.
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

  // 追问建议(小模型生成,挂在最后一条助手消息上,空闲时展示)
  const followUps = $derived.by(() => {
    if (C.streaming || !conversation) return []
    const last = conversation.messages.at(-1)
    if (last?.role !== 'assistant' || last.error) return []
    return last.suggestions ?? []
  })

  let scroller = $state(null)
  let nearBottom = $state(true)
  let exported = $state(false)

  // —— 长对话:新一轮提问顶部锚定(ChatGPT 式)——
  // 发送后把用户这条消息顶到视口顶部,回答在下方流式展开;
  // 靠一个尾部占位撑出空间,答案变长时占位自动收缩,超过一屏后归零。
  let spacerH = $state(0)
  let liveAnchor = false // 当前是否处于"新回合锚定"模式
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
    // 落点:浮动控件下缘再留一点缝,用户这条消息刚好停在页眉之下
    const header = scroller.parentElement?.querySelector('.chat-top')
    const targetTop = (header?.offsetHeight ?? 56) + TOP_GAP
    // 用户消息在内容中的位置(用 rect 差,免受 offsetParent 影响)
    const userOffset =
      lastUser.getBoundingClientRect().top - col.getBoundingClientRect().top
    // 去掉当前占位后的真实内容高度
    const contentH = scroller.scrollHeight - spacerH
    // 使"滚到底"时 userOffset - scrollTop === targetTop
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
      setTimeout(() => (exported = false), 1500)
    } catch {
      /* ignore */
    }
  }

  // 切换会话 / 新一轮发送 / 流式跟随 —— 合并成一个 effect,保证顺序确定
  $effect(() => {
    const id = C.activeId
    const conv = C.conversations.find((c) => c.id === id) ?? null
    const len = conv?.messages.length ?? 0
    const last = conv?.messages.at(-1)
    void last?.content
    void last?.reasoning
    void last?.suggestions
    if (!scroller) return

    // 切换会话:重置锚定,直接落到底部
    if (id !== prevId) {
      prevId = id
      prevLen = len
      liveAnchor = false
      spacerH = 0
      nearBottom = true
      tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
      return
    }

    // 同会话内消息增多 → 视为新一轮发送,开启顶部锚定
    if (len > prevLen) {
      liveAnchor = true
      nearBottom = true
    }
    prevLen = len

    // 只在跟随底部时调整占位,避免用户上翻阅读时布局突然位移
    if (!nearBottom) return
    untrack(() => recomputeSpacer())
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
  })

  // 回复完成:释放顶部锚定占位。锚定只是"流式期间"的临时affordance,
  // 让回答从顶部从容展开;答完就收起占位,短回合自然贴合底部,不留突兀空白。
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

  // 回复完成后,若包含较完整的 HTML/SVG 代码块 → 自动打开预览(Artifacts 语义)
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

<div class="chat">
  <div class="chat-main">
    {#if AG.active}
      <AgentThread />
    {:else}
      <div class="chat-top">
        <div class="chat-top-left">
          <span
            class="scope-chip"
            data-testid="assistant-scope-chip"
            data-scope-kind={scopeUi.kind}
            title={scopeUi.label}
            aria-label={scopeUi.label}
          >
            {scopeUi.entity
              ? `${scopeUi.space} · ${scopeUi.entity}`
              : scopeUi.space}
          </span>
        </div>
        <div class="chat-top-right">
          <ModelPicker />
          <div
            class="chat-top-actions"
            role="toolbar"
            aria-label={t('chat.title')}
          >
            {#if !isEmpty}
              <button
                type="button"
                class="top-btn"
                title={exported ? t('chat.exported') : t('chat.export')}
                aria-label={exported ? t('chat.exported') : t('chat.export')}
                onclick={exportConversation}
              >
                <Icon
                  name={exported ? 'check' : 'download'}
                  size={15}
                  strokeWidth={1.75}
                />
              </button>
              <button
                type="button"
                class="top-btn"
                title={t('chat.newChat')}
                aria-label={t('chat.newChat')}
                onclick={startNewChat}
              >
                <Icon name="compose" size={15} strokeWidth={1.75} />
              </button>
            {/if}
          </div>
        </div>
      </div>

      {#if isEmpty}
        <!-- Round 1.2: flatten attention + suggestions; Composer in dock for keyboard inset -->
        <div class="hero hero--conversation">
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
                <Icon name="chevron-right" size={13} strokeWidth={1.75} />
              </button>
            {/each}
          </div>
          <p class="hint hint--empty">{chatHint}</p>
          <p class="hint hint--trust">{t('chat.emptyTrust')}</p>
        </div>
        <div class="dock dock--empty">
          <div class="dock-col">
            <Composer autofocus={composerAutofocus} />
          </div>
        </div>
      {:else}
        <div
          class="thread aios-scroll"
          bind:this={scroller}
          onscroll={onScroll}
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
                    <Icon name="chevron-right" size={13} strokeWidth={1.75} />
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
        <div class="dock">
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
            <Composer />
            <p class="hint hint--dock">{chatHint}</p>
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

  /* Floating chrome — veil only; controls stay light like Claude/ChatGPT. */
  .chat-top {
    /* Toolbar geometry shares --kenos-chrome-* with SystemBar / Domain headers. */
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
    background: linear-gradient(
      to bottom,
      var(--bg) 28%,
      color-mix(in srgb, var(--bg) 48%, transparent) 72%,
      transparent
    );
  }
  .chat-top > :global(*) {
    pointer-events: auto;
  }
  .chat-top-left {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .chat-top-right {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .scope-chip {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    max-width: min(42vw, 200px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    border-radius: 999px;
    padding: 3px 8px;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
    font-size: var(--kenos-type-meta, 12px);
    font-weight: 500;
    letter-spacing: 0.02em;
    background: color-mix(in srgb, var(--t1) 4%, transparent);
  }
  .chat-top-actions {
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 0;
    border-radius: var(--kenos-chrome-cluster-radius, 10px);
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    border: 1px solid color-mix(in srgb, var(--t1) 8%, transparent);
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    box-shadow: none;
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
    transition:
      background 160ms ease,
      color 160ms ease;
  }
  .top-btn :global(svg) {
    width: var(--kenos-chrome-icon-size, 15px);
    height: var(--kenos-chrome-icon-size, 15px);
  }
  .top-btn:hover {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
    color: var(--t1);
  }

  /* Starter prompts — light rows, no white card (Composer owns the surface) */
  .suggestions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    width: 100%;
    margin-top: 2px;
    background: transparent;
    border: 0;
    border-radius: 0;
    overflow: visible;
    padding: 0;
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
    text-transform: none;
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
    transition:
      background 160ms ease,
      color 160ms ease,
      border-color 160ms ease;
  }
  .assistant-chip :global(svg:first-child) {
    flex: 0 0 auto;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
  }
  .assistant-chip :global(svg:last-child) {
    flex: 0 0 auto;
    margin-left: auto;
    color: color-mix(in srgb, var(--t3) 80%, transparent);
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
  .assistant-chip:active {
    background: color-mix(in srgb, var(--t1) 8%, transparent);
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
    box-shadow: 0 4px 16px color-mix(in srgb, #000 10%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 5;
  }
  .to-bottom:hover {
    background: var(--card);
  }

  /* Attention — plain text block, no card chrome */
  .attention-brief {
    display: grid;
    gap: 6px;
    padding: 0 2px;
    background: transparent;
    border: 0;
    border-radius: 0;
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
  .attention-list li:last-child {
    margin-bottom: 0;
  }
  .attention-ask {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-body, 15px);
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  :global(html[data-ios-native-shell='true'] .attention-brief) {
    gap: 4px;
  }
  :global(html[data-ios-native-shell='true'] .hero) {
    justify-content: flex-start;
    padding-top: 8px;
    gap: 14px;
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

  /* Empty state — attention → composer (primary) → quiet suggestions */
  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 16px;
    width: min(100% - 32px, 680px);
    margin-inline: auto;
    padding: calc(var(--safe-top-effective, 0px) + 48px) 0 3vh;
  }
  .hero :global(.composer) {
    box-shadow:
      0 1px 0 color-mix(in srgb, #fff 65%, transparent) inset,
      0 4px 18px color-mix(in srgb, #000 5%, transparent);
  }

  :global(html[data-ios-native-shell='true'] .hero) {
    gap: 12px;
    padding: 44px 0 2vh;
    justify-content: flex-start;
  }
  :global(html[data-ios-native-shell='true'] .hero) :global(.composer) {
    box-shadow:
      0 1px 0 color-mix(in srgb, #fff 40%, transparent) inset,
      0 2px 10px color-mix(in srgb, #000 7%, transparent);
  }
  :global(html[data-ios-native-shell='true'] .chat-top) {
    padding: 6px var(--kenos-chrome-inline, 16px)
      var(--kenos-chrome-header-pad-bottom, 8px);
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--bg) 92%, transparent) 20%,
      color-mix(in srgb, var(--bg) 28%, transparent) 80%,
      transparent
    );
  }
  :global(html[data-ios-native-shell='true'] .chat-top-actions) {
    background: color-mix(in srgb, #fff 12%, transparent);
    border-color: color-mix(in srgb, #fff 16%, transparent);
    box-shadow:
      0 0 0 0.5px color-mix(in srgb, #000 24%, transparent),
      0 1px 0 color-mix(in srgb, #fff 8%, transparent) inset;
  }
  :global(html[data-ios-native-shell='true'] .scope-chip) {
    background: color-mix(in srgb, #fff 8%, transparent);
    color: color-mix(in srgb, #fff 62%, transparent);
  }
  :global(
      html[data-ios-native-shell='true'][data-theme='light'] .chat-top-actions
    ),
  :global(
      html[data-ios-native-shell='true']:not([data-theme='dark'])
        .chat-top-actions
    ) {
    /* Match DomainMusicHeader / KenosSystemBar light cluster */
    background: color-mix(in srgb, var(--card, #fff) 82%, transparent);
    border-color: color-mix(in srgb, var(--t1) 10%, transparent);
    box-shadow: none;
  }
  :global(html[data-ios-native-shell='true'][data-theme='light'] .scope-chip),
  :global(
      html[data-ios-native-shell='true']:not([data-theme='dark']) .scope-chip
    ) {
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    color: color-mix(in srgb, var(--t1) 52%, transparent);
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
    gap: 22px;
    padding-block: calc(var(--safe-top-effective, 0px) + 52px) 10px;
  }
  .thread-spacer {
    flex: 0 0 auto;
    margin-top: -28px;
  }

  .follow-ups {
    display: grid;
    gap: 0;
    margin-top: -2px;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .follow-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--t2);
    padding: 9px 2px;
    font-size: 13px;
    line-height: 1.35;
    text-align: start;
    cursor: pointer;
    transition:
      background 160ms ease,
      color 160ms ease;
    animation: follow-in 220ms ease both;
  }
  .follow-chip span {
    flex: 1;
    min-width: 0;
  }
  .follow-chip :global(svg) {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--t3) 70%, transparent);
  }
  .follow-chip:hover {
    background: color-mix(in srgb, var(--t1) 4%, transparent);
    color: var(--t1);
  }
  @keyframes follow-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .follow-chip,
    .assistant-chip:active {
      animation: none;
      transform: none;
    }
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
  .dock--empty {
    /* Keep empty-state Composer in the keyboard-safe dock column */
    padding-top: 4px;
  }
  .dock-col {
    position: relative;
    width: min(100% - 32px, 680px);
    margin-inline: auto;
    /* keyboard-open: ios-safari.css lifts this by --keyboard-inset */
    padding-bottom: max(8px, var(--safe-bottom, 0px));
    transition: padding-bottom 160ms ease;
  }
  .dock-col :global(.composer) {
    box-shadow:
      0 1px 0 color-mix(in srgb, #fff 55%, transparent) inset,
      0 3px 14px color-mix(in srgb, #000 5%, transparent);
  }

  .hint {
    margin: 4px 0 0;
    text-align: start;
    font-size: var(--kenos-type-meta, 12px);
    letter-spacing: 0.01em;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
  }
  .hint--empty {
    margin-top: 4px;
    opacity: 1;
    /* Secondary body — stronger than tertiary/disabled gray */
    font-size: var(--kenos-type-secondary, 13px);
    line-height: 1.4;
    color: color-mix(
      in srgb,
      var(--t1) calc(var(--kenos-emphasis-secondary, 0.68) * 100%),
      transparent
    );
  }
  .hint--trust {
    margin-top: 2px;
    font-size: var(--kenos-type-meta, 12px);
    opacity: 0.9;
  }
  .hint--dock {
    margin: 6px 2px 0;
    text-align: center;
  }

  :global(html[data-ios-native-shell='true'] .thread-col) {
    gap: 16px;
    padding-block: 44px 6px;
  }
  :global(html[data-ios-native-shell='true'] .dock) {
    background: linear-gradient(
      to top,
      var(--bg) 82%,
      color-mix(in srgb, var(--bg) 22%, transparent) 100%
    );
  }
  :global(html[data-ios-native-shell='true'] .hint--empty) {
    font-size: var(--kenos-type-secondary, 13px);
    opacity: 1;
  }
  :global(html[data-ios-native-shell='true'] .chat-top-right) {
    gap: 4px;
  }
</style>
