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
