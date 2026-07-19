// 本地演示模式(localhost)—— 会话库为空时在内存里灌入一组丰富 demo 对话,
// 让聊天页 + /history 在「本地 AI 网关未启动」时也有内容可看、可展示。
// 严格约束:
//   - 仅 localhost 生效;云端查看器构建(CLOUD_BUILD)永不激活;
//   - demo 数据只存在内存,绝不落 localStorage、绝不触发云同步(见 chat.svelte.js 的接入);
//   - 只在「空库」分支调用,已有真实数据时永不覆盖。
// 语义与 planner 的 demoMode 对齐(?demo=0 关闭 / ?demo=1 开启,持久化到 aios_demo)。
import { browser } from '$app/environment'
import { CLOUD_BUILD } from '$lib/env.js'

const FLAG_KEY = 'aios_demo'
const CONTROL_FLAG_KEY = 'kenos_phase2_demo'

function isLocalHost() {
  if (!browser) return false
  const h = location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h === '::1' ||
    h.endsWith('.localhost')
  )
}

/** 空库时是否应灌入 demo 数据。仅本地 localhost、且非云端构建;消化 ?demo= 开关。 */
export function shouldSeedDemo() {
  if (CLOUD_BUILD) return false
  if (!isLocalHost()) return false
  try {
    const p = new URLSearchParams(location.search)
    if (p.has('demo')) {
      const on = p.get('demo') !== '0'
      localStorage.setItem(FLAG_KEY, on ? '1' : '0')
      return on
    }
    if (localStorage.getItem(FLAG_KEY) === '0') return false
  } catch {
    /* localStorage 不可用 → 按默认(灌)处理 */
  }
  return true
}

/**
 * Phase 2 control-surface rehearsal is opt-in, unlike the legacy chat demo.
 * Use ?kenosDemo=1 locally; ?kenosDemo=0 clears the persisted local choice.
 */
export function shouldSeedControlDemo() {
  if (CLOUD_BUILD || !isLocalHost()) return false
  try {
    const params = new URLSearchParams(location.search)
    if (params.has('kenosDemo')) {
      const enabled = params.get('kenosDemo') === '1'
      localStorage.setItem(CONTROL_FLAG_KEY, enabled ? '1' : '0')
      return enabled
    }
    return localStorage.getItem(CONTROL_FLAG_KEY) === '1'
  } catch {
    return false
  }
}
