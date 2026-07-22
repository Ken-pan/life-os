import { browser } from '$app/environment'
import { CLOUD, retryShellAutoSignIn } from '$lib/cloud.svelte.js'

/**
 * 壳内「设备优先 + 优雅降级」登录状态机(对标 passkey/WebAuthn 的落地范式:
 * 生物识别/设备密钥为主,永远保留一条恢复路径,不给用户留死胡同)。
 *
 * 状态:
 * - `connecting`  静默尝试中(挂载即自动跑一次),或尚未出结论 —— 不显示任何登录框
 * - `connected`   已拿到会话(上层据此渲染已登录态,本组件通常已不显示)
 * - `offline`     离线且未接上 —— 只提示"恢复联网自动接上",不露密码(离线密码也没用)
 * - `needsFallback` 在线但设备登录没成 —— 露出邮箱密码兜底(登录一次即自动完成本机配对)
 *
 * 用法:组件里 `const gate = createDeviceAuthGate()`,onMount 调 `gate.start()`,
 * 模板读 `gate.state`,手动重试调 `gate.retry()`。
 */
export function createDeviceAuthGate() {
  let tried = $state(false)
  let online = $state(browser ? navigator.onLine : true)

  const state = $derived.by(() => {
    if (CLOUD.user) return 'connected'
    // 尝试进行中或尚未跑过:统一按 connecting,避免首帧闪出兜底表单
    if (CLOUD.busy || !tried) return 'connecting'
    return online ? 'needsFallback' : 'offline'
  })

  async function retry() {
    tried = false
    await retryShellAutoSignIn()
    tried = true
  }

  /** 挂载调用:绑定在线状态监听 + 首次静默尝试;返回清理函数。 */
  function start() {
    if (!browser) return () => {}
    const on = () => (online = true)
    const off = () => (online = false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    if (!CLOUD.user) void retry()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }

  return {
    get state() {
      return state
    },
    retry,
    start,
  }
}
