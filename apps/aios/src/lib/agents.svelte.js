import { browser } from '$app/environment'
import { isNative, AI_APP_LIST, aiAppSendDirect, aiAppReadDirect } from '$lib/native.js'
import { C } from '$lib/chat.svelte.js'

/**
 * 代理会话:把 Mac 上的 AI 应用(Codex/Cursor/ChatGPT/Claude)当作常驻联系人。
 * 与普通对话不同,这里是**直连管道**——用户消息经 ai_app_send 原样发给目标应用,
 * 「查看进展」经 ai_app_read(截屏+视觉模型)转录成对方的回复,不经过本地 LLM 的
 * 工具调用,链路确定。仅原生壳可用。
 */

const STORAGE_KEY = 'aios_agent_threads_v1'

function loadThreads() {
  if (!browser) return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export const AG = $state({
  /** 可用代理(浏览器里为空 → 整个功能隐藏) */
  available: isNative ? AI_APP_LIST : [],
  /** @type {string|null} 当前打开的代理 key;非空时主界面显示代理线程 */
  active: null,
  /** @type {Record<string, {messages: Array<{role:'user'|'agent'|'note', content:string, at:number}>}>} */
  threads: loadThreads(),
  /** 正在发送/读取 */
  busy: false,
})

function save() {
  if (!browser) return
  try {
    // 每线程最多留 200 条,控制体积
    for (const th of Object.values(AG.threads)) {
      if (th.messages.length > 200) th.messages = th.messages.slice(-200)
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AG.threads))
  } catch {
    /* 静默 */
  }
}

export function agentInfo(key) {
  return AG.available.find((a) => a.key === key) ?? null
}

export function openAgent(key) {
  if (!agentInfo(key)) return
  if (!AG.threads[key]) AG.threads[key] = { messages: [] }
  AG.active = key
  C.activeId = null
}

export function closeAgent() {
  AG.active = null
}

export function clearAgentThread(key) {
  if (AG.threads[key]) {
    AG.threads[key].messages = []
    save()
  }
}

function push(key, role, content) {
  AG.threads[key].messages.push({ role, content, at: Date.now() })
  save()
}

/** 发消息给当前代理;发送成功后 20 秒自动查看一次进展 */
export async function agentSend(text, { newTask = false } = {}) {
  const key = AG.active
  const trimmed = text?.trim()
  if (!key || !trimmed || AG.busy) return
  push(key, 'user', trimmed)
  AG.busy = true
  try {
    const res = await aiAppSendDirect({ app: key, message: trimmed, new_chat: newTask })
    push(key, 'note', res)
    if (!/失败|错误/.test(res)) {
      setTimeout(() => {
        if (AG.active === key && !AG.busy) agentRefresh()
      }, 20000)
    }
  } catch (err) {
    push(key, 'note', `发送出错:${err?.message ?? err}`)
  } finally {
    AG.busy = false
  }
}

/** 查看当前代理的进展(会短暂前置目标应用) */
export async function agentRefresh(question) {
  const key = AG.active
  if (!key || AG.busy) return
  AG.busy = true
  try {
    const res = await aiAppReadDirect({ app: key, question })
    push(key, 'agent', res)
  } catch (err) {
    push(key, 'note', `读取出错:${err?.message ?? err}`)
  } finally {
    AG.busy = false
  }
}
