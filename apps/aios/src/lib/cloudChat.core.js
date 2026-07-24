/**
 * Cloud Kimi fallback helpers (no $app / browser deps).
 */

/** Tools allowed when chat runs via Kimi proxy (no local gateway). */
export const CLOUD_SAFE_TOOL_KEYS = [
  'get_time',
  'calculate',
  'run_javascript',
  'save_memory',
  'search_memory',
  'fetch_url',
  'web_search',
  'life_os_today',
  'finance_summary',
  'planner_tasks',
  'planner_add_task',
  // Browser-local Kenos shell actions (execute in the user's client, not on Kimi)
  'focus_status',
  'start_focus',
  'end_focus',
  'open_space',
  'compose_library_note',
]

const CLOUD_SAFE_SET = new Set(CLOUD_SAFE_TOOL_KEYS)

/**
 * @param {{ cloudBuild?: boolean, gatewayOk?: boolean }} opts
 * @returns {'local'|'kimi'}
 */
export function resolveChatBackendKind({
  cloudBuild = false,
  gatewayOk = false,
} = {}) {
  if (!cloudBuild) return 'local'
  return gatewayOk ? 'local' : 'kimi'
}

/**
 * @param {string} model
 * @returns {'kimi-k2.5'|'kimi-k2.6'}
 */
export function mapUiModelToKimi(model) {
  if (
    model === 'llm-quality' ||
    model === 'vlm-quality' ||
    model === 'kimi-k2.6'
  ) {
    return 'kimi-k2.6'
  }
  return 'kimi-k2.5'
}

/**
 * @param {Array<object>} messages
 */
export function messagesHaveImageParts(messages) {
  if (!Array.isArray(messages)) return false
  for (const m of messages) {
    const content = m?.content
    if (!Array.isArray(content)) continue
    if (content.some((p) => p?.type === 'image_url' || p?.type === 'image')) {
      return true
    }
  }
  return false
}

/**
 * Filter OpenAI tool defs for a chat backend.
 * @param {Array<{ type?: string, function?: { name?: string } }>} defs
 * @param {'local'|'kimi'} kind
 */
export function filterToolDefsForBackend(defs, kind) {
  if (!Array.isArray(defs)) return []
  if (kind !== 'kimi') return defs
  return defs.filter((d) => CLOUD_SAFE_SET.has(d?.function?.name))
}

export {
  adaptToolDefsForKimi,
  buildKenosCloudIdentityBlock,
  buildKenosCloudOsMapBlock,
  buildKenosCloudRecencyRule,
  buildKenosCloudSystemBundle,
  buildKenosCloudToolPlaybook,
  buildKimiCloudSystemNote,
  KENOS_CLOUD_PROMPT_VERSION,
  KIMI_CLOUD_SYSTEM_NOTE,
} from './kenos/kenosCloudPrompt.core.js'

/**
 * 瞬时聊天错误(值得静默重试):云 upstream 抖动 / 网关 5xx / 断网。
 * 明确**不**重试:未配置/来源禁止/入参错(4xx)/视觉不支持 —— 重试也没用。
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientChatError(err) {
  const m = String(
    (err && typeof err === 'object' && 'message' in err ? err.message : err) ?? '',
  )
  if (
    m === 'kimi_not_configured' ||
    m === 'not_configured' ||
    m === 'forbidden_origin' ||
    m === 'kimi_vision_unsupported' ||
    m === 'vision_unsupported' ||
    m.startsWith('bad_')
  ) {
    return false
  }
  if (m === 'upstream_error') return true
  if (/^kimi_(5\d\d|429|408)$/.test(m)) return true
  if (/^gateway 5\d\d$/.test(m)) return true
  if (/^tts 5\d\d$/.test(m)) return true
  const name = err && typeof err === 'object' && 'name' in err ? err.name : ''
  if (name === 'TypeError' || /load failed|failed to fetch|network/i.test(m)) {
    return true
  }
  return false
}
