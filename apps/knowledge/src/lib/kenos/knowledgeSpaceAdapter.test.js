import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { APP_HOME } from '../nav.js'
import {
  LIBRARY_HOME_PATH,
  LIBRARY_SPACE_ID,
  resolveLibraryActiveTab,
  suspendLibrarySpace,
  buildLibraryNavManifest,
  prepareLibraryLeave,
} from './knowledgeSpaceAdapter.js'
import {
  clearLibraryEditorSession,
  setLibraryEditorSession,
} from './libraryEditorSession.js'

describe('knowledgeSpaceAdapter (Library)', () => {
  beforeEach(() => {
    clearLibraryEditorSession()
  })

  it('uses frozen library id (knowledge alias)', () => {
    assert.equal(LIBRARY_SPACE_ID, 'library')
    assert.equal(LIBRARY_HOME_PATH, '/library')
    assert.equal(APP_HOME, LIBRARY_HOME_PATH)
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

  it('resolves Domain dock activeTab from real paths', () => {
    assert.equal(resolveLibraryActiveTab('/'), 'inbox')
    assert.equal(resolveLibraryActiveTab('/inbox'), 'inbox')
    assert.equal(resolveLibraryActiveTab('/library'), 'library')
    assert.equal(resolveLibraryActiveTab('/library?note=x'), 'library')
    assert.equal(resolveLibraryActiveTab('/recall'), 'recall')
    assert.equal(resolveLibraryActiveTab('/projects'), 'more')
    assert.equal(resolveLibraryActiveTab('/settings'), 'settings')
  })

  it('marks unsavedDraft when dirty without liveState=editing', () => {
    setLibraryEditorSession({
      isDirty: () => true,
      title: () => 'WIP',
      flush() {},
      discard() {},
      cleanupIfBlank() {},
    })
    const m = buildLibraryNavManifest()
    // editing would hide Domain Dock while keeping 80px pad — never use for notes.
    assert.notEqual(m.liveState, 'editing')
    assert.equal(m.unsavedDraft, true)
    assert.equal(m.summary, 'WIP')
  })

  it('prepareLibraryLeave is read-only (never calls cleanupIfBlank)', () => {
    let cleaned = 0
    setLibraryEditorSession({
      isDirty: () => true,
      title: () => 'Draft',
      flush() {},
      discard() {},
      cleanupIfBlank() {
        cleaned += 1
      },
    })
    const probe = prepareLibraryLeave()
    assert.equal(cleaned, 0)
    assert.equal(probe.dirty, true)
    assert.equal(probe.summary, 'Draft')
  })

  it('prepareLibraryLeave is clean when unbound', () => {
    assert.deepEqual(prepareLibraryLeave(), { dirty: false, summary: '' })
  })
})
