<script>
  import { tick, untrack } from 'svelte'
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
  import ModelPicker from '$lib/components/ModelPicker.svelte'
  import SidePanel from '$lib/components/SidePanel.svelte'
  import { openArtifact } from '$lib/panel.svelte.js'

  const conversation = $derived(
    C.conversations.find((c) => c.id === C.activeId) ?? null,
  )
  const isEmpty = $derived(!conversation || conversation.messages.length === 0)

  const suggestions = $derived([
    { icon: 'image', text: t('chat.suggestImage') },
    { icon: 'search', text: t('chat.suggestSearch') },
    { icon: 'code', text: t('chat.suggestCode') },
    { icon: 'lightbulb', text: t('chat.suggestBrainstorm') },
  ])

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
      openArtifact({ lang: match[1], code: match[2], title: conversation.title })
    }
  })
</script>

<svelte:window onresize={onResize} />

<div class="chat">
  <div class="chat-main">
  <div class="chat-top">
    <ModelPicker />
    <div class="chat-top-actions">
      {#if !isEmpty}
        <button
          type="button"
          class="top-btn"
          title={exported ? t('chat.exported') : t('chat.export')}
          aria-label={exported ? t('chat.exported') : t('chat.export')}
          onclick={exportConversation}
        >
          <Icon name={exported ? 'check' : 'download'} size={18} strokeWidth={1.75} />
        </button>
      {/if}
      <button
        type="button"
        class="top-btn"
        title={t('chat.newChat')}
        aria-label={t('chat.newChat')}
        onclick={startNewChat}
      >
        <Icon name="compose" size={19} strokeWidth={1.75} />
      </button>
    </div>
  </div>

  {#if isEmpty}
    <div class="hero">
      <h1>{t('chat.greeting')}</h1>
      <Composer autofocus />
      <div class="suggestions">
        {#each suggestions as item (item.text)}
          <button type="button" class="chip" onclick={() => sendMessage(item.text)}>
            <Icon name={item.icon} size={14} strokeWidth={1.75} />
            {item.text}
          </button>
        {/each}
      </div>
      <p class="hint">{t('chat.hintLocal')}</p>
    </div>
  {:else}
    <div class="thread aios-scroll" bind:this={scroller} onscroll={onScroll}>
      <div class="thread-col">
        {#each conversation.messages as message, i (i)}
          <Message {message} index={i} isLast={i === conversation.messages.length - 1} />
        {/each}
        {#if followUps.length}
          <div class="follow-ups" aria-label={t('chat.followUps')}>
            {#each followUps as text (text)}
              <button type="button" class="follow-chip" onclick={() => sendMessage(text)}>
                {text}
              </button>
            {/each}
          </div>
        {/if}
        <div class="thread-spacer" aria-hidden="true" style:height="{spacerH}px"></div>
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
        <p class="hint">{t('chat.hintLocal')}</p>
      </div>
    </div>
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

  /* —— 顶部控件:浮层化,不再占据独立页眉带 ——
     模型选择器 + 操作按钮悬浮在消息流之上,内容满高滚动到其下方;
     一层从 --bg 渐隐到透明的薄幕遮住上滑内容,读起来"没有页眉"。 */
  .chat-top {
    position: absolute;
    inset: 0 0 auto 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(var(--safe-top-effective, 0px) + 8px) 12px 10px;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      var(--bg) 32%,
      color-mix(in srgb, var(--bg) 55%, transparent) 68%,
      transparent
    );
  }
  .chat-top > :global(*) {
    pointer-events: auto;
  }
  .chat-top-actions {
    display: flex;
    gap: 2px;
  }
  .top-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--t2);
    cursor: pointer;
  }
  .top-btn:hover {
    background: var(--card);
    color: var(--t1);
  }

  /* —— 空态建议 —— */
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-l);
    border-radius: 999px;
    background: var(--bg);
    color: var(--t2);
    padding: 8px 14px;
    font-size: var(--text-sm, 13px);
    cursor: pointer;
    transition: all var(--dur-fast, 120ms) var(--ease, ease);
  }
  .chip:hover {
    background: var(--card);
    color: var(--t1);
    border-color: var(--border-l);
  }

  /* —— 回到底部 —— */
  .to-bottom {
    position: absolute;
    top: -46px;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border-l);
    border-radius: 50%;
    background: var(--bg);
    color: var(--t1);
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 5;
  }
  .to-bottom:hover {
    background: var(--card);
  }

  /* —— 空态:居中问候 + 输入框 —— */
  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-5, 20px);
    width: min(100% - 32px, 704px);
    margin-inline: auto;
    padding-bottom: 12vh;
  }
  .hero h1 {
    margin: 0;
    font-size: clamp(22px, 3.2vw, 30px);
    font-weight: 600;
    color: var(--t1);
    text-align: center;
    letter-spacing: -0.01em;
  }
  .hero :global(.composer) {
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  }

  /* —— 消息流 —— */
  .thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .thread-col {
    width: min(100% - 32px, 704px);
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6, 24px);
    /* 顶部留出浮动控件的高度,首条消息不被遮住 */
    padding-block: calc(var(--safe-top-effective, 0px) + 56px) var(--space-4, 16px);
  }

  /* 新回合顶部锚定用的尾部占位(高度由 JS 计算);
     负 margin 抵消 flex gap,占位为 0 时不产生多余留白 */
  .thread-spacer {
    flex: 0 0 auto;
    margin-top: calc(-1 * var(--space-6, 24px));
  }

  /* —— 追问建议(回复下方,ChatGPT 式)—— */
  .follow-ups {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: -8px;
  }
  .follow-chip {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--t2);
    padding: 7px 14px;
    font-size: var(--text-sm, 13px);
    text-align: start;
    cursor: pointer;
    transition: all var(--dur-fast, 120ms) var(--ease, ease);
    animation: follow-in 240ms var(--ease, ease) both;
  }
  .follow-chip:hover {
    background: var(--card);
    color: var(--t1);
    border-color: var(--border-l);
  }
  @keyframes follow-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .follow-chip {
      animation: none;
    }
  }

  /* —— 底部输入区 —— */
  .dock {
    flex: 0 0 auto;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
  }
  .dock-col {
    position: relative;
    width: min(100% - 32px, 704px);
    margin-inline: auto;
    padding-bottom: max(var(--space-2, 8px), var(--safe-bottom, 0px));
  }

  .hint {
    margin: 8px 0 0;
    text-align: center;
    font-size: var(--text-xs, 11px);
    color: var(--t3);
  }
</style>
