import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  adaptToolDefsForKimi,
  buildKenosCloudIdentityBlock,
  buildKenosCloudOsMapBlock,
  buildKenosCloudRecencyRule,
  buildKenosCloudSystemBundle,
  buildKenosCloudToolPlaybook,
  KENOS_CLOUD_PROMPT_VERSION,
  KENOS_SPACE_MAP,
} from './kenosCloudPrompt.core.js'

describe('kenosCloudPrompt v2', () => {
  it('exports kenos-cloud-v2 version', () => {
    assert.equal(KENOS_CLOUD_PROMPT_VERSION, 'kenos-cloud-v2')
  })

  it('identity frames Kenos OS operator, not generic Kimi', () => {
    const block = buildKenosCloudIdentityBlock({
      cloudAuthorized: true,
      writesBlocked: true,
    })
    assert.match(block, /## Role/)
    assert.match(block, /Korben/)
    assert.match(block, /Life OS/)
    assert.match(block, /不要自称 Kimi/)
    assert.match(block, /写权限:关闭/)
  })

  it('os map covers core spaces and focus/library actions', () => {
    const map = buildKenosCloudOsMapBlock()
    assert.match(map, /## Spaces/)
    assert.match(map, /Plan/)
    assert.match(map, /Money/)
    assert.match(map, /Health/)
    assert.match(map, /start_focus/)
    assert.match(map, /compose_library_note/)
    assert.ok(KENOS_SPACE_MAP.includes('Training') || /Training/.test(map))
  })

  it('tool playbook prefers Life OS tools before web', () => {
    const play = buildKenosCloudToolPlaybook({
      webAccess: true,
      cloudAuthorized: true,
      writesBlocked: false,
    })
    assert.match(play, /## Tools/)
    const todayAt = play.indexOf('life_os_today')
    const webAt = play.indexOf('web_search')
    assert.ok(todayAt >= 0 && webAt > todayAt)
    assert.match(play, /planner_add_task/)
  })

  it('system bundle has labeled sections; Final is last via recency rule', () => {
    const bundle = buildKenosCloudSystemBundle({
      webAccess: true,
      cloudAuthorized: true,
      writesBlocked: true,
    })
    assert.equal(bundle.length, 5)
    assert.match(bundle[0], /## Role/)
    assert.match(bundle[1], /## Tools/)
    assert.match(bundle[2], /## Constraints/)
    assert.match(bundle[3], /## Output contract/)
    assert.match(bundle[4], /## Spaces/)
    const final = buildKenosCloudRecencyRule()
    assert.match(final, /## Final/)
    assert.match(final, /先调用再回答/)
  })

  it('adapts tool descriptions with WHEN / WHEN NOT', () => {
    const adapted = adaptToolDefsForKimi([
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: '搜索优先用 browser_search',
        },
      },
      {
        type: 'function',
        function: { name: 'get_time', description: '时间' },
      },
      {
        type: 'function',
        function: { name: 'unknown_tool', description: 'keep' },
      },
    ])
    assert.equal(
      adapted[0].function.description.includes('browser_search'),
      false,
    )
    assert.match(adapted[0].function.description, /WHEN/)
    assert.match(adapted[0].function.description, /Life OS/)
    assert.match(adapted[1].function.description, /WHEN/)
    assert.equal(adapted[2].function.description, 'keep')
  })
})
