import { describe, it, expect, vi } from 'vitest'
import { formatDateCompact } from './dateFormat.js'

vi.mock('../i18n/index.js', () => ({
  localeTag: () => 'zh-CN',
}))

describe('formatDateCompact', () => {
  it('formats zh date without year to avoid wrapping', () => {
    expect(formatDateCompact('2026-07-06')).toMatch(/^7月6日/)
  })
})
