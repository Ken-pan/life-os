#!/usr/bin/env node
/**
 * KnowledgeOS 纯函数单测（node 直跑，不碰 $lib/$app）：
 * markdown 渲染保真 + XSS + wikilink；frontmatter 往返保留（数据完整性护栏）。
 *
 *   node apps/knowledge/scripts/knowledge-unit.mjs
 *
 * 锁死的核心不变量：编辑写回绝不损坏未知 frontmatter（src-fp / aliases /
 * 自定义 type），目录派生标签不回写文件。
 */
import { renderMarkdown, extractWikilinks } from '../src/lib/markdown.js'
import {
  parseFrontmatter,
  patchFrontmatter,
  serializeItem,
} from '../src/lib/frontmatter.js'

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1
  } else {
    fail += 1
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}
function includes(name, haystack, needle) {
  ok(name, haystack.includes(needle), `缺 "${needle}" in ${JSON.stringify(haystack.slice(0, 120))}`)
}

/* ===== markdown ===== */
{
  const h = renderMarkdown('# 标题\n\n正文 **粗** *斜* `c`')
  includes('heading', h, '<h1>标题</h1>')
  includes('bold', h, '<strong>粗</strong>')
  includes('inline-code', h, '<code>c</code>')

  const links = renderMarkdown('看 [[A]] 和 [[B|别名]] 和 [外链](https://x.com)')
  includes('wikilink', links, 'data-wikilink="A"')
  includes('wikilink-alias', links, '>别名</a>')
  includes('ext-link', links, 'href="https://x.com"')

  ok('extractWikilinks-dedup', extractWikilinks('[[A]] [[A]] [[B|c]]').length === 2)

  const xss = renderMarkdown('<script>alert(1)</scr' + 'ipt>')
  ok('xss-neutralized', !xss.includes('<script>'), xss)

  // 表格
  const table = renderMarkdown('| 名 | 值 |\n|---|---|\n| a | 1 |\n| b | 2 |')
  includes('table-th', table, '<th>名</th>')
  includes('table-td', table, '<td>1</td>')
  ok('table-rows', (table.match(/<tr>/g) || []).length === 3) // 1 header + 2 body

  // 任务框
  const tasks = renderMarkdown('- [ ] 待办\n- [x] 完成')
  includes('task-unchecked', tasks, '<input type="checkbox" disabled />')
  includes('task-checked', tasks, 'disabled checked />')

  // 嵌套列表
  const nested = renderMarkdown('- 顶\n  - 子\n  - 子2\n- 顶2')
  ok('nested-ul-count', (nested.match(/<ul>/g) || []).length === 2, nested)
  ok('nested-li-count', (nested.match(/<li>/g) || []).length === 4)

  // 引用 + 代码块 + 分隔线
  includes('blockquote', renderMarkdown('> 引用'), '<blockquote>引用</blockquote>')
  includes('codeblock', renderMarkdown('```\ncode\n```'), '<pre><code>code</code></pre>')
  includes('hr', renderMarkdown('---'), '<hr />')

  // 边界不抛
  for (const c of ['', '   ', '#', '```', '| a |', '- ', '[[', '**x']) {
    let threw = false
    try {
      renderMarkdown(c)
    } catch {
      threw = true
    }
    ok(`no-throw ${JSON.stringify(c)}`, !threw)
  }
}

/* ===== frontmatter 往返（数据完整性）===== */
{
  const fm = parseFrontmatter('---\ntype: judgment\nsrc-fp: abc123\naliases:\n  - 别名A\n  - 别名B\ntags: [x, y]\ncreated: 2026-01-02T03:04:05.000Z\n---\n正文内容')
  ok('fm-parse-type', fm.meta.type === 'judgment')
  ok('fm-parse-srcfp', fm.meta['src-fp'] === 'abc123')
  ok('fm-parse-aliases', Array.isArray(fm.meta.aliases) && fm.meta.aliases.length === 2)
  ok('fm-parse-body', fm.body === '正文内容')
  ok('fm-raw-kept', typeof fm.raw === 'string' && fm.raw.includes('src-fp: abc123'))

  // patch：只改 tags，保留 src-fp / type / aliases / created
  const patched = patchFrontmatter(fm.raw, { tags: '[x, y, z]' })
  includes('patch-keeps-srcfp', patched, 'src-fp: abc123')
  includes('patch-keeps-type', patched, 'type: judgment')
  includes('patch-keeps-created', patched, 'created: 2026-01-02T03:04:05.000Z')
  includes('patch-new-tags', patched, 'tags: [x, y, z]')
  ok('patch-single-tags', (patched.match(/^tags:/gm) || []).length === 1, patched)
  includes('patch-keeps-aliases', patched, '别名A')

  // 无 frontmatter 的纯笔记：patch null 不产出空壳
  ok('patch-null-empty', patchFrontmatter(null, { tags: null, url: null, pinned: null }) === '')

  // serializeItem：编辑 curator 笔记（自定义 type + src-fp）后往返，src-fp 必须还在
  const item = {
    ...fm.meta,
    id: '020_Judgments/note.md',
    type: 'note', // 展示归一，但 rawFm 保留 judgment
    title: 'note',
    body: '改过的正文',
    url: '',
    tags: ['x', 'y', 'judgments'], // judgments 是目录派生
    pinned: false,
    createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
    _rawFm: fm.raw,
    _folderTag: 'judgments',
  }
  const out = serializeItem(item)
  includes('serialize-keeps-srcfp', out, 'src-fp: abc123')
  includes('serialize-keeps-customtype', out, 'type: judgment')
  ok('serialize-drops-foldertag', !out.includes('judgments'), '目录派生标签 judgments 不该回写')
  includes('serialize-writes-realtags', out, 'x, y')
  includes('serialize-body', out, '改过的正文')
  ok('serialize-created-once', (out.match(/^created\s*:/gm) || []).length === 1, out)

  // 新笔记（_seedCreated）：写入 created；编辑既有笔记不会加
  const fresh = serializeItem({
    id: 'x', type: 'note', title: 't', body: '身体', url: '', tags: [],
    pinned: false, createdAt: 1735790645000, _rawFm: null, _folderTag: undefined,
    _seedCreated: true,
  })
  includes('fresh-has-created', fresh, 'created:')
  includes('fresh-body', fresh, '身体')
  // 编辑既有纯文本笔记（无 _seedCreated）→ 保持纯文本，不平白加 created
  const editedPlain = serializeItem({
    id: 'x', type: 'note', title: 't', body: '编辑后', url: '', tags: [],
    pinned: false, createdAt: 1735790645000, _rawFm: null, _folderTag: undefined,
  })
  ok('edit-plain-no-fm', !editedPlain.startsWith('---'), editedPlain.slice(0, 20))

  // 纯笔记无任何管理字段 → 不加 frontmatter
  const plain = serializeItem({
    id: 'x', type: 'note', title: 't', body: '纯文本', url: '', tags: [],
    pinned: false, createdAt: 0, _rawFm: '', _folderTag: undefined,
  })
  ok('plain-no-fm', !plain.startsWith('---'), plain.slice(0, 20))
}

console.log(`knowledge-unit: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
