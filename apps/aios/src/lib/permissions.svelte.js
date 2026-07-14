/**
 * macOS 权限中心 —— 主动预检 / 请求 / 引导。
 *
 * 设计:web 里全是 no-op(isNative=false),原生壳里才动态加载插件依赖。
 * 三项权限对应 AIOS 的原生能力:
 *   - screen(屏幕录制)  → look_at_screen / ai_app_read 的截屏
 *   - accessibility(辅助功能) → type_into_app / ai_app_send 的键盘模拟
 *   - automation(自动化/Apple Events) → open_mac_app 等 osascript 控制其它 app
 *
 * screen / accessibility 用官方风格的 tauri-plugin-macos-permissions 精准预检+原生请求框;
 * automation 无对应系统 API,用一次轻量 osascript 探测判断(system.events 的错误码)。
 */

import { isNative } from '$lib/native.js'

/** @type {{ screen: boolean|null, accessibility: boolean|null, automation: boolean|null, checkedAt: number }} */
export const PERMS = $state({
  screen: null, // null = 尚未探测
  accessibility: null,
  automation: null,
  checkedAt: 0,
})

/** 三项权限的展示元数据(UI 直接用) */
export const PERM_META = [
  {
    key: 'screen',
    label: '屏幕录制',
    icon: 'eye',
    why: '让 AIOS 看屏幕、读取其它 app 界面(look_at_screen、读 AI 助手回复)',
    pane: 'Privacy_ScreenCapture',
    needsRestart: true,
  },
  {
    key: 'accessibility',
    label: '辅助功能',
    icon: 'monitor',
    why: '让 AIOS 模拟键盘、把任务粘贴进其它 app 并回车(type_into_app、给 AI 助手派任务)',
    pane: 'Privacy_Accessibility',
    needsRestart: false,
  },
  {
    key: 'automation',
    label: '自动化',
    icon: 'terminal',
    why: '让 AIOS 用 AppleScript 打开/前置其它 app(open_mac_app、run_applescript)',
    pane: 'Privacy_Automation',
    needsRestart: false,
  },
]

async function macPerms() {
  return await import('tauri-plugin-macos-permissions-api')
}

async function shell() {
  return await import('@tauri-apps/plugin-shell')
}

/** 探测自动化权限:让 System Events 报出进程数;缺权限会返回错误码 -1743/-1719。 */
async function probeAutomation() {
  try {
    const { Command } = await shell()
    const out = await Command.create('osascript', [
      '-e',
      'tell application "System Events" to count processes',
    ]).execute()
    return out.code === 0 && /^\d+$/.test(out.stdout.trim())
  } catch {
    return false
  }
}

/** 静默刷新三项权限状态(不弹任何框)。web 里直接置空。 */
export async function refreshPermissions() {
  if (!isNative) {
    PERMS.screen = PERMS.accessibility = PERMS.automation = true
    return PERMS
  }
  try {
    const p = await macPerms()
    const [screen, accessibility, automation] = await Promise.all([
      p.checkScreenRecordingPermission(),
      p.checkAccessibilityPermission(),
      probeAutomation(),
    ])
    PERMS.screen = !!screen
    PERMS.accessibility = !!accessibility
    PERMS.automation = automation
  } catch (err) {
    console.error('[permissions] 刷新失败', err)
  }
  PERMS.checkedAt = Date.now()
  return PERMS
}

/** 触发屏幕录制的原生请求框(把 AIOS 加入列表)。授权后需重启才对 screencapture 生效。 */
export async function requestScreen() {
  if (!isNative) return
  const p = await macPerms()
  await p.requestScreenRecordingPermission()
  await refreshPermissions()
}

/** 触发辅助功能的原生请求框(带「打开系统设置」按钮)。 */
export async function requestAccessibility() {
  if (!isNative) return
  const p = await macPerms()
  await p.requestAccessibilityPermission()
  await refreshPermissions()
}

/** 触发自动化授权:主动发一次 Apple Event,系统首次会弹「允许 AIOS 控制 xx」。 */
export async function requestAutomation() {
  if (!isNative) return
  try {
    const { Command } = await shell()
    await Command.create('osascript', [
      '-e',
      'tell application "System Events" to count processes',
    ]).execute()
  } catch {
    /* 弹框被拒也没关系,状态由 refresh 决定 */
  }
  await refreshPermissions()
}

/** 深链直达系统设置对应隐私面板(比让用户自己翻靠谱)。 */
export async function openPrivacyPane(pane) {
  if (!isNative) return
  const { Command } = await shell()
  await Command.create('osascript', [
    '-e',
    `open location "x-apple.systempreferences:com.apple.preference.security?${pane}"`,
  ]).execute()
}

/** 重启 AIOS —— 屏幕录制授权后让 screencapture 子进程拿到新的 TCC 状态。 */
export async function relaunchApp() {
  if (!isNative) return
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

/**
 * 供原生工具在执行前调用的预检:缺权限时返回一段可操作的提示(去设置里开「权限」)。
 * 有权限返回 null,调用方照常执行。
 * @param {'screen'|'accessibility'|'automation'} key
 */
export async function ensurePermission(key) {
  if (!isNative) return null
  // 只在没探测过、或上次探测判定缺失时才实时复查,避免每次工具调用都打 osascript
  if (PERMS[key] !== true) await refreshPermissions()
  if (PERMS[key] === true) return null
  const meta = PERM_META.find((m) => m.key === key)
  return `缺少「${meta?.label ?? key}」权限,AIOS 还不能执行这个操作。请到 设置 → 权限 里一键授权${
    meta?.needsRestart ? '(授权后按提示重启 AIOS)' : ''
  },然后重试。`
}
