import { GATEWAY } from '$lib/localai.js'

/**
 * 生图实时进度(轮询生图服务 GET /progress)。
 * 服务是单推理线程,同一时刻只有一个生成任务,全局单例即可。
 */
export const IMG = $state({
  active: false,
  /** @type {'loading'|'generating'|'saving'|'idle'} */
  phase: 'loading',
  step: 0,
  steps: 0,
  elapsed: 0,
})

let pollTimer = null
let tickTimer = null
let startedAt = 0

/** generate_image 工具开始执行时调用;结束(无论成败)后 stop */
export function startImageProgress() {
  stopImageProgress()
  startedAt = Date.now()
  Object.assign(IMG, { active: true, phase: 'loading', step: 0, steps: 0, elapsed: 0 })
  // 用时本地每秒滴答(比 1.5s 轮询平滑),阶段/步数以服务端为准
  tickTimer = setInterval(() => {
    IMG.elapsed = Math.round((Date.now() - startedAt) / 1000)
  }, 1000)
  const poll = async () => {
    try {
      const res = await fetch(`${GATEWAY}/upstream/image/progress`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) return
      const p = await res.json()
      // 服务冷启动或任务尚未入列时短暂 idle,保持"唤醒中"不回跳
      if (p.phase && p.phase !== 'idle') {
        IMG.phase = p.phase
        IMG.step = p.step ?? 0
        IMG.steps = p.steps ?? 0
      }
    } catch {
      /* 服务正被网关拉起时瞬断,忽略 */
    }
  }
  poll()
  pollTimer = setInterval(poll, 1500)
}

export function stopImageProgress() {
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  pollTimer = tickTimer = null
  Object.assign(IMG, { active: false, phase: 'loading', step: 0, steps: 0, elapsed: 0 })
}
