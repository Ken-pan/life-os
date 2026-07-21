import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LIBRARY_SPACE_ID, suspendLibrarySpace } from './knowledgeSpaceAdapter.js'

describe('knowledgeSpaceAdapter (Library)', () => {
  it('uses frozen library id (knowledge alias)', () => {
    assert.equal(LIBRARY_SPACE_ID, 'library')
  })

  it('suspends resume pointer without vaultWrite true', () => {
    const d = suspendLibrarySpace({
      pathname: '/library',
      search: '?note=abc',
      noteTitle: 'Ideas',
    })
    assert.equal(d.spaceId, 'library')
    assert.equal(d.entityId, 'abc')
    assert.equal(d.substate?.vaultWrite, false)
  })
})
