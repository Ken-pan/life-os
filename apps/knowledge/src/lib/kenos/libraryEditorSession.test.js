import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  clearLibraryEditorSession,
  discardLibraryEditor,
  flushLibraryEditor,
  getLibraryEditorSession,
  probeLibraryEditor,
  setLibraryEditorSession,
} from './libraryEditorSession.js'

describe('libraryEditorSession', () => {
  beforeEach(() => {
    clearLibraryEditorSession()
  })

  it('probes clean when unbound', () => {
    assert.deepEqual(probeLibraryEditor(), { dirty: false, summary: '' })
    assert.equal(getLibraryEditorSession(), null)
  })

  it('reports dirty title for leave summary', () => {
    setLibraryEditorSession({
      isDirty: () => true,
      title: () => 'Draft ideas',
      flush() {},
      discard() {},
    })
    assert.deepEqual(probeLibraryEditor(), {
      dirty: true,
      summary: 'Draft ideas',
    })
  })

  it('falls back summary when dirty without title', () => {
    setLibraryEditorSession({
      isDirty: () => true,
      title: () => '  ',
      flush() {},
      discard() {},
    })
    assert.equal(probeLibraryEditor().summary, 'Unsaved note')
  })

  it('flush and discard call bound session', () => {
    let flushed = 0
    let discarded = 0
    let cleaned = 0
    const api = {
      isDirty: () => false,
      title: () => '',
      flush() {
        flushed += 1
      },
      discard() {
        discarded += 1
      },
      cleanupIfBlank() {
        cleaned += 1
      },
    }
    setLibraryEditorSession(api)
    flushLibraryEditor()
    discardLibraryEditor()
    getLibraryEditorSession()?.cleanupIfBlank?.()
    assert.equal(flushed, 1)
    assert.equal(discarded, 1)
    assert.equal(cleaned, 1)
    clearLibraryEditorSession(api)
    assert.equal(getLibraryEditorSession(), null)
  })
})
