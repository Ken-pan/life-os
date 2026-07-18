import assert from 'node:assert/strict'

import { extractWikilinks, parseWikilinks, knowledgeNoteUrl } from '../src/wikilinks.js'

// extractWikilinks：去 |显示名、去 #锚点、去重、保序
assert.deepEqual(extractWikilinks('见 [[目标A|显示]] 和 [[目标B#锚]] 再 [[目标A]]'), ['目标A', '目标B'])
assert.deepEqual(extractWikilinks(''), [])
assert.deepEqual(extractWikilinks(null), [])
assert.deepEqual(extractWikilinks('无链接的文本'), [])

// parseWikilinks：{ target, label } 保序去重；label 缺省回退 target
const parsed = parseWikilinks('[[床垫研究|买床笔记]] 与 [[GTD]] 与 [[床垫研究]]')
assert.deepEqual(parsed, [
  { target: '床垫研究', label: '买床笔记' },
  { target: 'GTD', label: 'GTD' },
])
// 锚点从 target 剥离，但 label 缺省时用「| 前原文」（不含 #）
assert.deepEqual(parseWikilinks('[[笔记#小节]]'), [{ target: '笔记', label: '笔记#小节' }])

// knowledgeNoteUrl：origin 去尾斜杠 + 目标编码
assert.equal(
  knowledgeNoteUrl('床垫研究', 'https://knowledge.kenos.space'),
  'https://knowledge.kenos.space/library?title=%E5%BA%8A%E5%9E%AB%E7%A0%94%E7%A9%B6',
)
assert.equal(knowledgeNoteUrl('A B', 'https://k.example/'), 'https://k.example/library?title=A%20B')

console.log('wikilinks.test.mjs: ok')
