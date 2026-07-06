/**
 * Action command bus — MCP waits synchronously; extension completes via WS or HTTP poll.
 */
import crypto from 'node:crypto'

/** @type {Map<string, { resolve: Function, reject: Function }>} */
const pending = new Map()

/** @type {Array<{ id: string, action: string, params: Record<string, unknown> }>} */
const pollQueue = []

/** @type {import('ws').WebSocket | null} */
let extensionWs = null

export function setExtensionSocket(ws) {
  extensionWs = ws
}

export function isExtensionConnected() {
  return extensionWs?.readyState === 1
}

function dispatch(cmd) {
  if (extensionWs?.readyState === 1) {
    extensionWs.send(JSON.stringify({ type: 'run', ...cmd }))
    return 'websocket'
  }
  pollQueue.push(cmd)
  return 'poll'
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {number} [timeoutMs]
 */
export function runAction(action, params = {}, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const cmd = { id, action, params }
    pending.set(id, { resolve, reject })
    const mode = dispatch(cmd)
    const timer = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      reject(
        new Error(
          `Action timeout (${action}) after ${timeoutMs}ms — extension ${mode === 'websocket' ? 'connected but silent' : 'not connected; enable Dev Agent Mode'}`,
        ),
      )
    }, timeoutMs)
    const wrap = pending.get(id)
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        wrap.resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        wrap.reject(e)
      },
    })
  })
}

/**
 * @param {string} id
 * @param {unknown} result
 * @param {string} [error]
 */
export function completeAction(id, result, error) {
  const p = pending.get(id)
  if (!p) return false
  pending.delete(id)
  if (error) p.reject(new Error(error))
  else p.resolve(result)
  return true
}

export function pullPollCommand() {
  return pollQueue.shift() || null
}

/** Legacy fire-and-forget commands (open_url, click_and_capture) */
export function enqueuePollCommand(command) {
  const id = crypto.randomUUID()
  const cmd = { id, ...command }
  pollQueue.push(cmd)
  return cmd
}

export function getAgentStatus() {
  return {
    extensionConnected: isExtensionConnected(),
    pendingActions: pending.size,
    pollQueueLength: pollQueue.length,
  }
}
