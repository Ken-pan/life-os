import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  domainDeepLink,
  isLocalDailyBeta,
  resolveDomainOrigin,
  rewriteDomainHrefForLocalDailyBeta,
} from './domainResume.core.js'

describe('domainResume local daily beta', () => {
  it('detects daily beta env', () => {
    assert.equal(isLocalDailyBeta({ VITE_KENOS_LOCAL_DAILY_BETA: '1' }), true)
    assert.equal(isLocalDailyBeta({ VITE_KENOS_LOCAL_DAILY_BETA: '0' }), false)
  })

  it('resolves local ports for plan/training when daily beta', () => {
    const env = { VITE_KENOS_LOCAL_DAILY_BETA: '1' }
    assert.equal(resolveDomainOrigin('plan', env), 'http://127.0.0.1:5188')
    assert.equal(resolveDomainOrigin('training', env), 'http://127.0.0.1:5190')
    assert.match(
      domainDeepLink('plan', '/upcoming', env),
      /127\.0\.0\.1:5188\/upcoming/,
    )
  })

  it('maps LAN daily-beta ports to hosted listKey', async () => {
    const { listKeyForDomainHref } = await import('./domainResume.core.js')
    assert.equal(
      listKeyForDomainHref('http://10.20.202.15:5188/upcoming'),
      'hosted:plan',
    )
    assert.equal(
      listKeyForDomainHref('http://10.20.202.15:5190/day/chest/focus'),
      'hosted:training',
    )
  })

  it('rewrites loopback resume to page host on phone', async () => {
    const { rewriteLoopbackToPageHost } = await import('./domainResume.core.js')
    // jsdom-less node: no window → identity
    assert.equal(
      rewriteLoopbackToPageHost('http://127.0.0.1:5188/upcoming'),
      'http://127.0.0.1:5188/upcoming',
    )
  })

  it('rewrites production fitness URLs to local daily beta', () => {
    const env = { VITE_KENOS_LOCAL_DAILY_BETA: '1' }
    const href =
      'https://training.kenos.space/day/chest/focus?kenosEx=c_fly&kenosSet=2'
    const out = rewriteDomainHrefForLocalDailyBeta(href, env)
    assert.match(out, /^http:\/\/127\.0\.0\.1:5190\//)
    assert.match(out, /kenosEx=c_fly/)
  })

  it('keeps production when not daily beta', () => {
    const env = { VITE_KENOS_LOCAL_DAILY_BETA: '0' }
    assert.equal(
      resolveDomainOrigin('plan', env),
      'https://plan.kenos.space',
    )
  })
})
