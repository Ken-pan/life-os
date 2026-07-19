/**
 * Visible Assistant scope labels (Global vs Context).
 * Same model for Global Assistant and Work/Focus Context Assistant.
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
    (focus.status === 'active' || focus.status === 'paused' || focus.status === 'temporarily_left')

  if (foreground) {
    const space = String(focus.activeSpace || focus.mode || 'Focus').trim() || 'Focus'
    const entity =
      String(
        focus.activeSessionRef?.title ||
          focus.title ||
          input.workContext?.title ||
          '',
      ).trim()
    const spaceLabel = space === 'deep_work' ? 'Work' : space === 'training' ? 'Training' : capitalize(space)
    if (entity && entity.toLowerCase() !== spaceLabel.toLowerCase()) {
      return {
        kind: 'context',
        label: `Scope: ${spaceLabel} · ${entity}`,
        space: spaceLabel,
        entity,
      }
    }
    return {
      kind: 'context',
      label: `Scope: ${spaceLabel}`,
      space: spaceLabel,
      entity: '',
    }
  }

  if (input.workContext?.title) {
    const entity = String(input.workContext.title).trim()
    return {
      kind: 'context',
      label: entity ? `Scope: Work · ${entity}` : 'Scope: Work',
      space: 'Work',
      entity,
    }
  }

  return {
    kind: 'global',
    label: 'Scope: All Kenos',
    space: 'All Kenos',
    entity: '',
  }
}

/** @param {string} value */
function capitalize(value) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
