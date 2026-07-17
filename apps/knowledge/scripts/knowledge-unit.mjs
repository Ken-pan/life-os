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
  itemFromFile,
  applyMetaPatch,
} from '../src/lib/frontmatter.js'
import {
  normalizeStatus,
  fromPlannerStatus,
  isProjectItem,
  projectRecord,
  matchPlannerProject,
  plannerTaskStats,
  parseGitHeadLog,
  senseProject,
  buildStatusReport,
} from '../src/lib/projects.js'

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

/* ===== 项目现状感知 ===== */
{
  // status 归一化：手写乱值全部收敛
  ok('st-active', normalizeStatus('active') === 'active')
  ok('st-inprogress', normalizeStatus('In Progress') === 'active')
  ok('st-designqa', normalizeStatus('Design QA') === 'active')
  ok('st-done', normalizeStatus('Done') === 'completed')
  ok('st-shipped', normalizeStatus('shipped') === 'completed')
  ok('st-hold', normalizeStatus('on-hold') === 'paused')
  ok('st-ref', normalizeStatus('reference') === 'reference')
  ok('st-unknown', normalizeStatus('whatever') === null)
  ok('st-empty', normalizeStatus('') === null)
  ok('planner-shipped', fromPlannerStatus('shipped') === 'completed')

  // 项目笔记判定：fm tags 含 project；索引/看板类排除；目录派生标签不算
  const projItem = itemFromFile(
    'Personal Project/NowLyrics.md',
    '---\ntags: [project, macos-app]\nstatus: active\npath: ~/「Projects」/NowLyrics\n---\n正文',
    null,
  )
  ok('proj-detect', isProjectItem(projItem))
  const indexItem = itemFromFile(
    'Personal Project/Projects 索引.md',
    '---\ntags: [project, index]\ntype: index\nstatus: active\n---\n索引',
    null,
  )
  ok('proj-skip-index', !isProjectItem(indexItem))
  const folderOnly = itemFromFile('Personal Project/说明.md', '普通笔记', null)
  ok('proj-skip-foldertag', !isProjectItem(folderOnly))

  const rec = projectRecord(projItem)
  ok('rec-status', rec.status === 'active')
  ok('rec-path', rec.path === '~/「Projects」/NowLyrics')

  // planner 匹配：标题归一 / slug / repoRefs 尾段
  const plannerProjects = [
    { id: 'p1', title: 'NowLyrics', slug: 'nowlyrics', status: 'shipped', repoRefs: [] },
    { id: 'p2', title: '照片整理', slug: 'photo-organizer', status: 'active', repoRefs: ['~/「Projects」/Photo Organizor'] },
  ]
  ok('match-title', matchPlannerProject({ title: 'NowLyrics', path: '' }, plannerProjects)?.id === 'p1')
  ok('match-title-norm', matchPlannerProject({ title: 'now lyrics', path: '' }, plannerProjects)?.id === 'p1')
  ok(
    'match-reporef',
    matchPlannerProject({ title: 'Photo-Organizor', path: '~/「Projects」/Photo Organizor' }, plannerProjects)?.id === 'p2',
  )
  ok('match-none', matchPlannerProject({ title: '不存在', path: '' }, plannerProjects) === null)

  // 任务聚合：墓碑/无项目排除，近两周完成单算
  const NOW = Date.parse('2026-07-16T12:00:00Z')
  const stats = plannerTaskStats(
    [
      { projectId: 'p1', completed: false },
      { projectId: 'p1', completed: true, completedAt: NOW - 3 * 86400000 },
      { projectId: 'p1', completed: true, completedAt: NOW - 60 * 86400000 },
      { projectId: 'p1', completed: false, deletedAt: NOW },
      { projectId: null, completed: false },
    ],
    { now: NOW },
  )
  const s1 = stats.get('p1')
  ok('stats-open', s1.open === 1)
  ok('stats-done', s1.done === 2)
  ok('stats-recent', s1.doneRecently === 1)

  // git logs/HEAD 解析：取最后一行时间戳
  const headLog = [
    '0000 aaaa Ken <k@x.com> 1751000000 -0700\tcommit: init',
    'aaaa bbbb Ken <k@x.com> 1752600000 -0700\tcommit: latest',
  ].join('\n')
  ok('git-parse', parseGitHeadLog(headLog) === 1752600000000)
  ok('git-parse-empty', parseGitHeadLog('') === 0)
  ok('git-parse-garbage', parseGitHeadLog('not a log') === 0)

  // 感知：planner 状态优先；git 活跃启发其次；completed 不被 git 空闲降级
  const senseP = senseProject(
    { status: 'active', title: 'NowLyrics' },
    { planner: { status: 'shipped' }, stats: null, lastCommitAt: 0, now: NOW },
  )
  ok('sense-planner-wins', senseP.suggested === 'completed' && senseP.drift)
  const senseGitActive = senseProject(
    { status: null, title: 'x' },
    { lastCommitAt: NOW - 5 * 86400000, now: NOW },
  )
  ok('sense-git-active', senseGitActive.suggested === 'active')
  const senseIdle = senseProject(
    { status: 'active', title: 'x' },
    { lastCommitAt: NOW - 120 * 86400000, now: NOW },
  )
  ok('sense-git-idle', senseIdle.suggested === 'paused')
  const senseSettled = senseProject(
    { status: 'completed', title: 'x' },
    { lastCommitAt: NOW - 5 * 86400000, now: NOW },
  )
  ok('sense-completed-stays', senseSettled.suggested === null && !senseSettled.drift)
  const senseAligned = senseProject(
    { status: 'active', title: 'x' },
    { lastCommitAt: NOW - 5 * 86400000, now: NOW },
  )
  ok('sense-aligned-nodrift', !senseAligned.drift)

  // applyMetaPatch：写 status/last_updated 不碰未知字段，往返落盘仍完整
  const item = itemFromFile(
    'Personal Project/X.md',
    '---\ntags: [project]\nstatus: active\nsrc-fp: keepme\ntech: [Swift 6]\npath: ~/「Projects」/X\n---\n正文',
    null,
  )
  applyMetaPatch(item, { status: 'paused', last_updated: '2026-07-16' })
  ok('metapatch-meta', item._meta.status === 'paused' && item._meta.last_updated === '2026-07-16')
  const written = serializeItem(item)
  includes('metapatch-status', written, 'status: paused')
  includes('metapatch-lastupd', written, 'last_updated: 2026-07-16')
  includes('metapatch-keeps-srcfp', written, 'src-fp: keepme')
  includes('metapatch-keeps-tech', written, 'tech: [Swift 6]')
  includes('metapatch-keeps-path', written, 'path: ~/「Projects」/X')
  ok('metapatch-status-once', (written.match(/^status:/gm) || []).length === 1, written)
  // 再次解析（模拟下次冷启动）确认无损
  const reread = itemFromFile('Personal Project/X.md', written, null)
  ok('metapatch-roundtrip', reread._meta.status === 'paused' && reread._meta['src-fp'] === 'keepme')

  // 报告生成：包含项目行与证据
  const report = buildStatusReport([
    {
      record: { id: 'Personal Project/X.md', title: 'X', status: 'active', rawStatus: 'active' },
      sense: { suggested: null, reasons: ['3 天前有提交'], drift: false },
    },
  ])
  includes('report-title', report, '# 📡 项目现状（自动）')
  includes('report-row', report, '| X | 🟢 进行中 | 3 天前有提交 | [[X]] |')
  includes('report-fm', report, 'generated_by: knowledgeos')
}

console.log(`knowledge-unit: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
