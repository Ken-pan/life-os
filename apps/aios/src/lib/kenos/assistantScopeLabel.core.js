/**
 * Visible Assistant scope labels (Global vs Context).
 * Same model for Global Assistant and Work/Focus Context Assistant.
 * Round 1: Chinese product UI (品牌名 Kenos 保留).
 */

/**
 * @param {{
 *   focus?: {
 *     status?: string
 *     activeSpace?: string
 *     title?: string
 *     mode?: string
 *     activeSessionRef?: { type?: string, title?: string } | null
 *     assistantScope?: { allowedDomains?: string[] } | null
 *   } | null
 *   workContext?: { title?: string } | null
 * }} [input]
 */
export function resolveAssistantScopeLabel(input = {}) {
  const focus = input.focus
  const foreground =
    focus &&
    (focus.status === 'active' ||
      focus.status === 'paused' ||
      focus.status === 'temporarily_left')

  if (foreground) {
    const space =
      String(focus.activeSpace || focus.mode || 'Focus').trim() || 'Focus'
    const entity = String(
      focus.activeSessionRef?.title ||
        focus.title ||
        input.workContext?.title ||
        '',
    ).trim()
    const spaceLabel =
      space === 'deep_work' || space === 'work'
        ? '工作'
        : space === 'training'
          ? '训练'
          : space === 'plan'
            ? '计划'
            : space === 'Focus' || space === 'focus'
              ? '专注'
              : capitalize(space)
    if (entity && entity.toLowerCase() !== spaceLabel.toLowerCase()) {
      return {
        kind: 'context',
        label: `范围：${spaceLabel} · ${entity}`,
        space: spaceLabel,
        entity,
      }
    }
    return {
      kind: 'context',
      label: `范围：${spaceLabel}`,
      space: spaceLabel,
      entity: '',
    }
  }

  if (input.workContext != null) {
    const entity = String(input.workContext.title || '').trim()
    return {
      kind: 'context',
      label: entity ? `范围：工作 · ${entity}` : '范围：工作',
      space: '工作',
      entity,
    }
  }

  return {
    kind: 'global',
    label: '范围：全部空间',
    space: '全部空间',
    entity: '',
  }
}

/** @param {string} value */
function capitalize(value) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
