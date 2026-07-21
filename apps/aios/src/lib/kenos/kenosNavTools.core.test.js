import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildLibraryComposeHref,
  resolveOpenSpaceTarget,
} from './kenosNavTools.core.js'

describe('kenosNavTools', () => {
  it('resolves in-app and domain spaces', () => {
    const work = resolveOpenSpaceTarget('work')
    assert.equal(work.ok, true)
    assert.equal(work.href, '/work')
    assert.equal(work.external, false)

    const plan = resolveOpenSpaceTarget('plan', {
      env: { VITE_KENOS_LOCAL_DAILY_BETA: '0' },
    })
    assert.equal(plan.ok, true)
    assert.match(plan.href, /kenos\.space|planner/)
    assert.equal(plan.label, 'Plan')

    const bad = resolveOpenSpaceTarget('nope')
    assert.equal(bad.ok, false)
  })

  it('builds library compose deep link', () => {
    const built = buildLibraryComposeHref(
      { title: '周记', body: '今天做了 Focus 工具' },
      { env: { VITE_KENOS_LOCAL_DAILY_BETA: '0' } },
    )
    assert.equal(built.ok, true)
    assert.match(built.href, /compose=1/)
    assert.match(built.href, /title=/)
    assert.match(built.href, /body=/)
  })

  it('requires title or body for compose', () => {
    const empty = buildLibraryComposeHref({})
    assert.equal(empty.ok, false)
  })
})
