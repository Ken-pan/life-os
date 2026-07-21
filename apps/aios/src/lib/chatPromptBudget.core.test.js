import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CORE_TOOL_NAMES,
  NOTE_TOOL_NAMES,
  detectLocalAssistNeeds,
  toolNamesForNeeds,
  filterToolsByNeeds,
  buildLocalToolHandbookLines,
  priorToolNamesFromConversation,
} from './chatPromptBudget.core.js'

describe('detectLocalAssistNeeds', () => {
  it('keeps plain writing/planning lean', () => {
    const n = detectLocalAssistNeeds('帮我写一封催稿邮件，大约100字')
    assert.equal(n.notes, false)
    assert.equal(n.browser, false)
    assert.equal(n.image, false)
    assert.equal(n.nativeHeavy, false)
  })

  it('detects notes / daily / browser / image', () => {
    assert.equal(detectLocalAssistNeeds('我上次定的发布策略是什么').notes, true)
    assert.equal(detectLocalAssistNeeds('今天怎么样，有什么会').daily, true)
    assert.equal(detectLocalAssistNeeds('查一下最新 iPhone 价格').browser, true)
    assert.equal(detectLocalAssistNeeds('帮我生成一张海报').image, true)
  })

  it('expands from prior tool names', () => {
    const n = detectLocalAssistNeeds('继续', {
      priorToolNames: ['search_notes', 'browser_search'],
    })
    assert.equal(n.notes, true)
    assert.equal(n.browser, true)
  })
})

describe('toolNamesForNeeds', () => {
  it('starts from core (includes notes schema)', () => {
    const names = toolNamesForNeeds({
      notes: false,
      daily: false,
      browser: false,
      image: false,
      lifeOs: false,
      lifeOsWrite: false,
      nativeHeavy: false,
    })
    for (const n of CORE_TOOL_NAMES) assert.ok(names.has(n))
    for (const n of NOTE_TOOL_NAMES) assert.ok(names.has(n))
    assert.equal(names.has('browser_search'), false)
    assert.equal(names.has('generate_image'), false)
  })

  it('adds browser tools on browser intent', () => {
    const names = toolNamesForNeeds({
      notes: false,
      daily: false,
      browser: true,
      image: false,
      lifeOs: false,
      lifeOsWrite: false,
      nativeHeavy: false,
    })
    assert.ok(names.has('browser_search'))
    assert.ok(names.has('open_browser_page'))
  })
})

describe('filterToolsByNeeds', () => {
  it('keeps allowed + mcp-like names', () => {
    const tools = [
      { function: { name: 'calculate' } },
      { function: { name: 'browser_search' } },
      { function: { name: 'mcp_foo__bar' } },
    ]
    const allowed = toolNamesForNeeds({
      notes: false,
      daily: false,
      browser: false,
      image: false,
      lifeOs: false,
      lifeOsWrite: false,
      nativeHeavy: false,
    })
    const filtered = filterToolsByNeeds(tools, allowed)
    assert.deepEqual(
      filtered.map((t) => t.function.name),
      ['calculate', 'mcp_foo__bar'],
    )
  })
})

describe('buildLocalToolHandbookLines', () => {
  it('omits notes/browser handbooks when lean', () => {
    const lines = buildLocalToolHandbookLines(
      {
        notes: false,
        daily: false,
        browser: false,
        image: false,
        lifeOs: false,
        lifeOsWrite: false,
        nativeHeavy: false,
      },
      { toolsEnabled: true, cloudAuthorized: true },
    )
    const joined = lines.join('\n')
    assert.match(joined, /工具选择速查/)
    assert.match(joined, /life_os_today/)
    assert.doesNotMatch(joined, /project-git-pulse/)
    assert.doesNotMatch(joined, /browser_search\(结果自带摘要/)
  })

  it('includes notes bundle when daily', () => {
    const lines = buildLocalToolHandbookLines(
      {
        notes: false,
        daily: true,
        browser: false,
        image: false,
        lifeOs: false,
        lifeOsWrite: false,
        nativeHeavy: false,
      },
      { toolsEnabled: true },
    )
    assert.match(lines.join('\n'), /project-git-pulse/)
  })
})

describe('priorToolNamesFromConversation', () => {
  it('collects names', () => {
    const names = priorToolNamesFromConversation({
      messages: [
        { toolCalls: [{ name: 'calculate' }, { name: 'search_notes' }] },
      ],
    })
    assert.deepEqual(names, ['calculate', 'search_notes'])
  })
})
