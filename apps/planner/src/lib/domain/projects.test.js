import { describe, expect, it } from 'vitest'
import { safeProjectRefUrl } from './projects.js'

describe('safeProjectRefUrl', () => {
  it('allows http and https project references', () => {
    expect(safeProjectRefUrl('https://github.com/Ken-pan/life-os')).toBe(
      'https://github.com/Ken-pan/life-os',
    )
    expect(safeProjectRefUrl('http://localhost:5188/projects/demo')).toBe(
      'http://localhost:5188/projects/demo',
    )
  })

  it('rejects executable, relative, and malformed URLs', () => {
    expect(safeProjectRefUrl('javascript:alert(1)')).toBeNull()
    expect(safeProjectRefUrl('/relative/path')).toBeNull()
    expect(safeProjectRefUrl('not a url')).toBeNull()
    expect(safeProjectRefUrl(null)).toBeNull()
  })
})
