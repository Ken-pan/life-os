/**
 * Assistant Focus tools — pure helpers over focusStore.core (testable, no $app).
 * Execution host commits via focusStore.svelte.js.
 */

import {
  emptyFocusState,
  endFocus,
  startDeepWorkFocus,
  startTrainingFocus,
} from './focusStore.core.js'

/** @typedef {'deep_work'|'training'} FocusMode */

/**
 * @param {unknown} mode
 * @returns {FocusMode | null}
 */
export function normalizeFocusMode(mode) {
  const raw = String(mode || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (
    raw === 'deep_work' ||
    raw === 'deepwork' ||
    raw === 'work' ||
    raw === 'plan' ||
    raw === 'focus' ||
    raw === 'deep'
  ) {
    return 'deep_work'
  }
  if (raw === 'training' || raw === 'workout' || raw === 'fitness') {
    return 'training'
  }
  return null
}

/** @param {ReturnType<typeof emptyFocusState>} state */
export function formatFocusStatus(state) {
  const focus = state?.focus
  if (!focus) {
    return '当前没有进行中的 Focus Session。可用 start_focus(mode=deep_work|training) 开始。'
  }
  const lines = [
    `Focus:「${focus.title || '未命名'}」`,
    `mode=${focus.mode}`,
    `status=${focus.status}`,
    focus.startedAt ? `startedAt=${focus.startedAt}` : null,
    focus.activeSpace ? `activeSpace=${focus.activeSpace}` : null,
    Array.isArray(focus.assistantScope?.allowedDomains)
      ? `allowedDomains=${focus.assistantScope.allowedDomains.join(',')}`
      : null,
  ].filter(Boolean)
  if (state.summary?.nextRecommendedStep) {
    lines.push(`上次摘要下一步:${state.summary.nextRecommendedStep}`)
  }
  if (state.lastError) lines.push(`lastError:${state.lastError}`)
  return lines.join('\n')
}

/**
 * @param {ReturnType<typeof emptyFocusState>} state
 * @param {{ mode?: string, title?: string }} [args]
 */
export function applyStartFocus(state, args = {}) {
  const mode = normalizeFocusMode(args.mode) || 'deep_work'
  const title = String(args.title || '').trim()
  const base = state && typeof state === 'object' ? state : emptyFocusState()
  const next =
    mode === 'training'
      ? startTrainingFocus({ ...base }, title ? { title } : {})
      : startDeepWorkFocus({ ...base }, title ? { title } : {})
  if (next.lastError) {
    return {
      ok: false,
      state: next,
      message: `无法开始 Focus:${next.lastError}`,
    }
  }
  return {
    ok: true,
    state: next,
    message: `已开始 Focus「${next.focus?.title}」(mode=${next.focus?.mode}, status=${next.focus?.status})。界面会进入专注壳;要结束时调用 end_focus。`,
  }
}

/**
 * @param {ReturnType<typeof emptyFocusState>} state
 * @param {{ notes?: string }} [args]
 */
export function applyEndFocus(state, args = {}) {
  const base = state && typeof state === 'object' ? state : emptyFocusState()
  if (!base.focus) {
    return {
      ok: false,
      state: base,
      message: '当前没有可结束的 Focus Session。',
    }
  }
  const notes = String(args.notes || '').trim() || null
  const title = base.focus.title
  const mode = base.focus.mode
  const next = endFocus({ ...base }, { notes })
  if (next.lastError) {
    return {
      ok: false,
      state: next,
      message: `无法结束 Focus:${next.lastError}`,
    }
  }
  const step = next.summary?.nextRecommendedStep
  return {
    ok: true,
    state: next,
    message: [
      `已结束 Focus「${title}」(mode=${mode}, status=${next.focus?.status || 'completed'})。`,
      step ? `建议下一步:${step}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}
