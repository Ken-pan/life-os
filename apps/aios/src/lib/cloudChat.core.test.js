import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLOUD_SAFE_TOOL_KEYS,
  filterToolDefsForBackend,
  mapUiModelToKimi,
  messagesHaveImageParts,
  resolveChatBackendKind,
} from './cloudChat.core.js'

describe('resolveChatBackendKind', () => {
  it('local builds always use local', () => {
    assert.equal(
      resolveChatBackendKind({ cloudBuild: false, gatewayOk: false }),
      'local',
    )
  })
  it('cloud falls back to kimi when gateway down', () => {
    assert.equal(
      resolveChatBackendKind({ cloudBuild: true, gatewayOk: false }),
      'kimi',
    )
  })
  it('cloud prefers local when gateway up', () => {
    assert.equal(
      resolveChatBackendKind({ cloudBuild: true, gatewayOk: true }),
      'local',
    )
  })
})

describe('mapUiModelToKimi', () => {
  it('maps fast/quality', () => {
    assert.equal(mapUiModelToKimi('llm-fast'), 'kimi-k2.5')
    assert.equal(mapUiModelToKimi('llm-quality'), 'kimi-k2.6')
  })
})

describe('filterToolDefsForBackend', () => {
  const defs = [
    ...CLOUD_SAFE_TOOL_KEYS.map((name) => ({
      type: 'function',
      function: { name },
    })),
    { type: 'function', function: { name: 'generate_image' } },
    { type: 'function', function: { name: 'browser_search' } },
    { type: 'function', function: { name: 'search_notes' } },
  ]

  it('keeps all for local', () => {
    assert.equal(filterToolDefsForBackend(defs, 'local').length, defs.length)
  })

  it('whitelists cloud-safe tools for kimi', () => {
    const filtered = filterToolDefsForBackend(defs, 'kimi')
    const names = filtered.map((d) => d.function.name).sort()
    assert.deepEqual(names, [...CLOUD_SAFE_TOOL_KEYS].sort())
    assert.ok(!names.includes('generate_image'))
    assert.ok(!names.includes('browser_search'))
  })
})

describe('KIMI_CLOUD_SYSTEM_NOTE re-export', () => {
  it('exposes Kenos-tuned v2 note with Final last', async () => {
    const { KIMI_CLOUD_SYSTEM_NOTE, KENOS_CLOUD_PROMPT_VERSION } =
      await import('./cloudChat.core.js')
    assert.equal(KENOS_CLOUD_PROMPT_VERSION, 'kenos-cloud-v2')
    assert.match(KIMI_CLOUD_SYSTEM_NOTE, /## Role/)
    assert.match(KIMI_CLOUD_SYSTEM_NOTE, /Korben/)
    assert.match(KIMI_CLOUD_SYSTEM_NOTE, /life_os_today/)
    assert.match(KIMI_CLOUD_SYSTEM_NOTE, /## Final/)
    assert.ok(
      KIMI_CLOUD_SYSTEM_NOTE.lastIndexOf('## Final') >
        KIMI_CLOUD_SYSTEM_NOTE.indexOf('## Spaces'),
    )
  })
})

describe('messagesHaveImageParts', () => {
  it('detects image_url parts', () => {
    assert.equal(
      messagesHaveImageParts([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'x' },
            { type: 'image_url', image_url: { url: 'data:' } },
          ],
        },
      ]),
      true,
    )
    assert.equal(
      messagesHaveImageParts([{ role: 'user', content: 'plain' }]),
      false,
    )
  })
})
