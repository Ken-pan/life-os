<script>
  import { tick } from 'svelte'
  import Icon from '@life-os/platform-web/svelte/icon'
  import { createImeGuard } from '@life-os/theme'
  import {
    AG,
    agentInfo,
    agentSend,
    agentRefresh,
    clearAgentThread,
  } from '$lib/agents.svelte.js'

  const ime = createImeGuard()
  const info = $derived(agentInfo(AG.active))
  const thread = $derived(AG.threads[AG.active] ?? { messages: [] })

  let draft = $state('')
  let newTask = $state(false)
  let scroller = $state(null)

  async function scrollToBottom() {
    await tick()
    scroller?.scrollTo({ top: scroller.scrollHeight })
  }

  $effect(() => {
    thread.messages.length
    scrollToBottom()
  })

  async function submit() {
    if (ime.isComposing()) return
    const text = draft.trim()
    if (!text || AG.busy) return
    draft = ''
    await agentSend(text, { newTask })
    newTask = false
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (ime.isComposing(e)) return
    e.preventDefault()
    submit()
  }

  function fmtTime(at) {
    return new Date(at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
</script>

<div class="agent-thread">
  <header class="agent-head">
    <div class="agent-id">
      <span class="agent-avatar"
        ><Icon
          name={info?.icon ?? 'monitor'}
          size={16}
          strokeWidth={1.75}
        /></span
      >
      <div class="agent-name">
        <strong>{info?.short}</strong>
        <span class="agent-desc">{info?.desc}</span>
      </div>
    </div>
    <div class="agent-actions">
      <button
        type="button"
        class="agent-btn"
        disabled={AG.busy}
        onclick={() => agentRefresh()}
        title="截屏读取该应用当前状态(会短暂前置它)"
      >
        <Icon name="refresh" size={14} strokeWidth={1.75} />
        查看进展
      </button>
      <button
        type="button"
        class="agent-btn subtle"
        onclick={() => clearAgentThread(AG.active)}
        title="清空这条线程的本地记录(不影响对方应用)"
      >
        <Icon name="trash" size={14} strokeWidth={1.75} />
      </button>
    </div>
  </header>

  <div class="agent-scroll aios-scroll" bind:this={scroller}>
    <div class="agent-col">
      {#if thread.messages.length === 0}
        <div class="agent-empty">
          <p>这是与 <strong>{info?.label}</strong> 的直连线程。</p>
          <p>
            在下面输入任务或问题,会原样发进它的输入框;「查看进展」会截屏读取它当前在做什么、有什么需要你确认。
          </p>
        </div>
      {/if}
      {#each thread.messages as m, i (i)}
        {#if m.role === 'user'}
          <div class="bubble user">
            {m.content}<span class="stamp">{fmtTime(m.at)}</span>
          </div>
        {:else if m.role === 'agent'}
          <div class="bubble agent">
            {m.content}<span class="stamp">{info?.short} · {fmtTime(m.at)}</span
            >
          </div>
        {:else}
          <div class="note">{m.content}</div>
        {/if}
      {/each}
      {#if AG.busy}
        <div class="note pulse">正在与 {info?.short} 通信…</div>
      {/if}
    </div>
  </div>

  <div class="agent-composer">
    <div class="agent-composer-col">
      <label class="newtask" title="发送前先在对方应用里新建对话/任务">
        <input type="checkbox" bind:checked={newTask} />
        新任务
      </label>
      <textarea
        rows="1"
        enterkeyhint="send"
        autocomplete="off"
        autocapitalize="sentences"
        spellcheck="true"
        placeholder={`发给 ${info?.short ?? ''} 的任务或回复…`}
        bind:value={draft}
        onkeydown={onKeydown}
        oncompositionstart={ime.compositionstart}
        oncompositionend={(e) => ime.compositionend(e)}
        oncompositioncancel={ime.compositioncancel}
        disabled={AG.busy}
      ></textarea>
      <button
        type="button"
        class="send"
        disabled={AG.busy || !draft.trim()}
        onclick={submit}
        aria-label="发送"
      >
        <Icon name="arrow-up" size={16} strokeWidth={2} />
      </button>
    </div>
    <p class="agent-hint">直连管道 · 发送与读取会短暂前置该应用</p>
  </div>
</div>

<style>
  .agent-thread {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .agent-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--border-l);
  }

  .agent-id {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .agent-avatar {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--bg-2);
    color: var(--t2);
  }

  .agent-name {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .agent-name strong {
    font-size: 14px;
    color: var(--t1);
  }

  .agent-desc {
    font-size: 11px;
    color: var(--t3);
  }

  .agent-actions {
    display: flex;
    gap: 6px;
  }

  .agent-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-size: 12px;
    color: var(--t2);
    background: var(--bg-2);
    border: 1px solid var(--border-l);
    border-radius: 8px;
    cursor: pointer;
  }

  .agent-btn:hover:not(:disabled) {
    color: var(--t1);
  }

  .agent-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .agent-btn.subtle {
    padding: 5px 7px;
  }

  .agent-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .agent-col {
    max-width: 760px;
    margin: 0 auto;
    padding: 18px 18px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .agent-empty {
    margin: 40px auto;
    max-width: 420px;
    text-align: center;
    color: var(--t3);
    font-size: 13px;
    line-height: 1.7;
  }

  .bubble {
    position: relative;
    max-width: 78%;
    padding: 9px 12px;
    border-radius: 14px;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--t1);
  }

  .bubble.user {
    align-self: flex-end;
    background: var(--accent);
    color: var(--on-accent);
    border-bottom-right-radius: 4px;
  }

  .bubble.agent {
    align-self: flex-start;
    background: var(--card);
    border: 1px solid var(--border-l);
    border-bottom-left-radius: 4px;
  }

  .stamp {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    opacity: 0.6;
  }

  .note {
    align-self: center;
    font-size: 12px;
    color: var(--t3);
    text-align: center;
    max-width: 90%;
    white-space: pre-wrap;
  }

  .note.pulse {
    animation: agent-pulse 1.2s ease-in-out infinite;
  }

  @keyframes agent-pulse {
    50% {
      opacity: 0.4;
    }
  }

  .agent-composer {
    padding: 8px 18px 10px;
  }

  .agent-composer-col {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 10px;
    background: var(--card);
    border: 1px solid var(--border-l);
    border-radius: 16px;
  }

  .newtask {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--t3);
    white-space: nowrap;
    padding-bottom: 6px;
    cursor: pointer;
  }

  textarea {
    flex: 1;
    resize: none;
    border: none;
    background: transparent;
    color: var(--t1);
    font: inherit;
    font-size: max(16px, var(--text-base, 14px));
    line-height: 1.5;
    padding: 5px 2px;
    max-height: 140px;
    outline: none;
  }

  .send {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
  }

  .send:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .agent-hint {
    max-width: 760px;
    margin: 6px auto 0;
    text-align: center;
    font-size: 11px;
    color: var(--t4);
  }
</style>
