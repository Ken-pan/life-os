import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MUSIC_SPACE_ID,
  buildMusicNavManifest,
  noteMusicPlayback,
  suspendMusicSpace,
} from './musicSpaceAdapter.js'

describe('musicSpaceAdapter', () => {
  it('uses frozen music space id', () => {
    assert.equal(MUSIC_SPACE_ID, 'music')
  })

  it('suspends with liveAccessory miniplayer', () => {
    const d = suspendMusicSpace({ pathname: '/', trackTitle: 'Test Track' })
    assert.equal(d.spaceId, 'music')
    assert.equal(d.displaySubtitle, 'Test Track')
    assert.equal(d.substate?.liveAccessory, 'miniplayer')
  })

  it('builds music nav manifest with playback snapshot', () => {
    noteMusicPlayback({})
    const idle = buildMusicNavManifest()
    assert.equal(idle.domainId, 'music')
    assert.equal(idle.title, 'Music')
    assert.equal(idle.liveState, 'idle')

    noteMusicPlayback({
      trackId: 't1',
      trackTitle: 'Night Drive',
      playing: true,
    })
    const playing = buildMusicNavManifest()
    assert.equal(playing.currentEntity, 't1')
    assert.equal(playing.liveState, 'playing')
    assert.equal(playing.summary, 'Night Drive')

    noteMusicPlayback({
      trackId: 't1',
      trackTitle: 'Night Drive',
      playing: false,
    })
    const paused = buildMusicNavManifest()
    assert.equal(paused.liveState, 'paused')
    noteMusicPlayback({})
  })
})
