import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WORK_SPACE_ID,
  buildWorkNavManifest,
  readWorkResumeQuery,
  suspendWorkSpace,
} from './workSpaceAdapter.js'
import { getDomainNavigationManifest } from './domainIntegration.core.js'

describe('workSpaceAdapter', () => {
  it('exports work space id aligned with registry', () => {
    assert.equal(WORK_SPACE_ID, 'work')
    const nav = getDomainNavigationManifest('work')
    assert.ok(nav.slots.some((s) => s.path === '/spaces/work'))
  })

  it('reads resume query params', () => {
    const q = readWorkResumeQuery(
      'https://www.kenos.space/work?kenosProject=p1&kenosFocus=1',
    )
    assert.equal(q.projectId, 'p1')
    assert.equal(q.focus, true)
  })

  it('suspends to ResumeDescriptor without sensitive fields', () => {
    const d = suspendWorkSpace({
      pathname: '/work',
      projectId: 'proj-1',
      projectTitle: 'Kenos IA',
    })
    assert.equal(d.spaceId, 'work')
    assert.equal(d.displayTitle, 'Work')
    assert.equal(d.entityId, 'proj-1')
    assert.match(d.displaySubtitle, /Kenos IA/)
    assert.ok(!/\b(token|password|secret)\b/i.test(JSON.stringify(d)))
  })

  it('builds work nav manifest for Continuity chrome', () => {
    const m = buildWorkNavManifest()
    assert.equal(m.domainId, 'work')
    assert.equal(m.title, 'Work')
    assert.ok(typeof m.activeTab === 'string')
  })
})
