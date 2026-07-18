import { describe, it, expect } from 'vitest'
import { searchEmptyState } from './searchEmptyState.js'

describe('searchEmptyState', () => {
  it('echoes the trimmed query when a keyword misses', () => {
    const es = searchEmptyState({ query: '  发票  ' })
    expect(es.messageKey).toBe('search.noMatch')
    expect(es.params).toEqual({ query: '发票' })
    expect(es.hintKey).toBe('search.noMatchHint')
  })

  it('prefers the keyword branch even when a filter is also active', () => {
    const es = searchEmptyState({ query: 'foo', tag: 'work', projectId: 'p1' })
    expect(es.messageKey).toBe('search.noMatch')
    expect(es.params).toEqual({ query: 'foo' })
  })

  it('reports a filter-only miss when only a tag is set', () => {
    const es = searchEmptyState({ tag: 'work' })
    expect(es.messageKey).toBe('search.noFilterMatch')
    expect(es.params).toBeUndefined()
    expect(es.hintKey).toBe('search.noMatchHint')
  })

  it('reports a filter-only miss when only a project is set', () => {
    const es = searchEmptyState({ projectId: 'p1' })
    expect(es.messageKey).toBe('search.noFilterMatch')
    expect(es.hintKey).toBe('search.noMatchHint')
  })

  it('treats whitespace-only query as no keyword', () => {
    const es = searchEmptyState({ query: '   ', tag: 'work' })
    expect(es.messageKey).toBe('search.noFilterMatch')
  })

  it('falls back to the generic empty state with no query or filter', () => {
    const es = searchEmptyState({})
    expect(es.messageKey).toBe('common.empty')
    expect(es.hintKey).toBe('search.emptyHint')
  })

  it('is safe with no arguments', () => {
    expect(searchEmptyState().messageKey).toBe('common.empty')
  })
})
