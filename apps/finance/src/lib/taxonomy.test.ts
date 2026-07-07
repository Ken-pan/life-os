import { describe, expect, it } from 'vitest'
import { TAXONOMY, isTaxonomyValue } from './taxonomy'

describe('taxonomy', () => {
  it('has six orthogonal groups', () => {
    expect(Object.keys(TAXONOMY)).toHaveLength(6)
  })

  it('validates known values', () => {
    expect(isTaxonomyValue('accountType', 'checking')).toBe(true)
    expect(isTaxonomyValue('accountType', 'nope')).toBe(false)
  })
})
