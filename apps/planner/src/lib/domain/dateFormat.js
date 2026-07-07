import { localeTag } from '../i18n/index.js'

/** @param {string|null|undefined} dateKey */
export function formatDateDisplay(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(y, m - 1, d))
}

/** @param {string|null|undefined} dateKey */
export function formatDateShort(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag(), {
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d))
}

/** @param {string|null|undefined} dateKey */
export function formatDateCompact(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const locale = localeTag()
  if (locale.startsWith('zh')) {
    const weekday = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
    }).format(dt)
    return `${m}月${d}日 ${weekday}`
  }
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(dt)
}
