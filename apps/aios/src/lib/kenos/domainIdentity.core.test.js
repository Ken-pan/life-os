import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DOMAIN_IDENTITY,
  domainAccent,
  domainIcon,
  domainIdentityCssVariables,
  resolveDomainIdentity,
} from './domainIdentity.core.js'

describe('domainIdentity.core', () => {
  it('maps Knife 4 spaces to distinct accents and glyphs', () => {
    assert.equal(DOMAIN_IDENTITY.training.accent, '#C45C4A')
    assert.equal(DOMAIN_IDENTITY.plan.icon, 'list-todo')
    assert.equal(DOMAIN_IDENTITY.money.accent, '#3D9B6E')
    assert.equal(DOMAIN_IDENTITY.music.icon, 'music')
    assert.equal(DOMAIN_IDENTITY.home.icon, 'home')
    assert.equal(DOMAIN_IDENTITY.knowledge.icon, 'notebook')
    assert.equal(DOMAIN_IDENTITY.work.icon, 'briefcase')
  })

  it('keeps Training warm coral distinct from critical-like reds', () => {
    assert.notEqual(DOMAIN_IDENTITY.training.accent.toLowerCase(), '#b9364f')
    assert.notEqual(DOMAIN_IDENTITY.training.accent.toLowerCase(), '#ff8fa2')
  })

  it('resolves from space id and hosted listKey', () => {
    assert.equal(resolveDomainIdentity('plan')?.id, 'plan')
    assert.equal(resolveDomainIdentity('hosted:training')?.id, 'training')
    assert.equal(domainAccent('hosted:money'), '#3D9B6E')
    assert.equal(domainIcon('work-focus'), 'focus')
  })

  it('emits CSS variables without duplicate work keys', () => {
    const css = domainIdentityCssVariables()
    assert.match(css, /--kenos-domain-training:\s*#C45C4A/)
    assert.equal((css.match(/--kenos-domain-work:/g) || []).length, 1)
  })
})
