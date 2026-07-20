import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isProdMusicReadEnabled, projectMusicFromTodayMusic } from './musicReadSource.core.js'
import { isProdHomeReadEnabled, projectHomeFromTodayHome } from './homeReadSource.core.js'

describe('music/home read sources', () => {
  it('defaults music and home reads Off', () => {
    assert.equal(isProdMusicReadEnabled({}), false)
    assert.equal(isProdHomeReadEnabled({}), false)
    assert.equal(isProdMusicReadEnabled({ VITE_KENOS_PROD_READ_MUSIC: '1' }), true)
    assert.equal(isProdHomeReadEnabled({ VITE_KENOS_PROD_READ_HOME: '1' }), true)
  })

  it('projects music without inventing tracks', () => {
    const projected = projectMusicFromTodayMusic({
      trackTitle: 'TGIF',
      trackArtist: 'XG',
      playedAt: '2026-07-18T16:26:23Z',
    })
    assert.equal(projected.trackTitle, 'TGIF')
    assert.equal(projected.deepLink, 'https://music.kenos.space')
  })

  it('projects home storage count', () => {
    const projected = projectHomeFromTodayHome({ storageZoneCount: 20 })
    assert.equal(projected.storageZoneCount, 20)
    assert.equal(projected.deepLink, 'https://home.kenos.space')
  })
})
