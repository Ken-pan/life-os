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
  parseAiSuggestions,
  parseGitHeadLog,
  senseProject,
  buildStatusReport,
} from '../src/lib/projects.js'
import {
  typeBreakdown,
  topTags,
  growthSeries,
  weeklyCounts,
  activityHeatmap,
  snapshot,
  groupNotes,
} from '../src/lib/analytics.js'
import { tagHueVar } from '../src/lib/tagColor.js'
import { markdownToBlocks, blocksToMarkdown, plainExcerpt, firstHeadingMatchesTitle } from '../src/lib/editor/blocks.js'
import {
  mdInlineToHtml,
  htmlInlineToMd,
  matchInlineRule,
  inlineToPlainText,
} from '../src/lib/editor/inline.js'

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

  // 图片：http(s) 放行、危险 scheme 拦截、不被链接规则先吃
  const img = renderMarkdown('![猫](https://ex.com/c.png)')
  includes('img-render', img, '<img class="md-img" src="https://ex.com/c.png" alt="猫"')
  ok('img-no-anchor', !/<a[^>]*c\.png/.test(img), img)
  const imgBad = renderMarkdown('![x](javascript:alert(1))')
  ok('img-scheme-blocked', !imgBad.includes('<img') && !imgBad.includes('javascript:'), imgBad)
  const imgRel = renderMarkdown('![y](./a/b.png)')
  includes('img-relative-ok', imgRel, 'src="./a/b.png"')

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

  // AI 建议队列解析（与 local-ai project_status.py 的 render_note 表格对齐）
  const aiBody = [
    '# 🔍 AI 项目状态建议',
    '',
    '| 项目 | 当前 | AI 建议 | 置信度 | 理由 |',
    '|------|------|---------|--------|------|',
    '| Side_TEMPO | active | paused | 高 | 无提交，仅 README 有改动 |',
    '| README | active | reference | 高 | 仅作为文档存在 |',
    '| 坏行 | active | notastatus | 高 | 建议值非法应跳过 |',
  ].join('\n')
  const ai = parseAiSuggestions(aiBody)
  ok('ai-parse-size', ai.size === 2)
  ok('ai-parse-row', ai.get('Side_TEMPO')?.status === 'paused' && ai.get('Side_TEMPO')?.confidence === '高')
  ok('ai-parse-skip-header', !ai.has('项目'))
  ok('ai-parse-skip-invalid', !ai.has('坏行'))
  ok('ai-parse-empty', parseAiSuggestions('').size === 0)

  // 证据优先级：Planner > AI > git 启发
  const aiSug = { status: 'paused', confidence: '高', reasoning: '停滞' }
  const senseAi = senseProject({ status: 'active', title: 'x' }, { ai: aiSug, now: NOW })
  ok('sense-ai-used', senseAi.suggested === 'paused' && senseAi.drift)
  ok('sense-ai-reason', senseAi.reasons[0].includes('AI'))
  const sensePlannerOverAi = senseProject(
    { status: 'paused', title: 'x' },
    { planner: { status: 'active' }, ai: aiSug, now: NOW },
  )
  ok('sense-planner-over-ai', sensePlannerOverAi.suggested === 'active')
  const senseAiOverGit = senseProject(
    { status: null, title: 'x' },
    { ai: aiSug, lastCommitAt: NOW - 5 * 86400000, now: NOW },
  )
  ok('sense-ai-over-git', senseAiOverGit.suggested === 'paused')
  const senseAiAligned = senseProject({ status: 'paused', title: 'x' }, { ai: aiSug, now: NOW })
  ok('sense-ai-aligned-nodrift', !senseAiAligned.drift)

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

/* ===== 块状编辑器：markdown ⇄ 块 往返 + 行内可逆（数据完整性护栏）===== */
{
  const md = [
    '# 标题一',
    '',
    '这是一段**加粗**和 *斜体* 还有 `code` 的正文，含 [[双链|显示]]。',
    '',
    '- 项目 A',
    '- 项目 B',
    '  - 子项',
    '',
    '- [ ] 待办未完成',
    '- [x] 待办完成',
    '',
    '1. 第一',
    '2. 第二',
    '',
    '> 一句引用',
    '',
    '```js',
    'const x = 1',
    '```',
    '',
    '---',
    '',
    '结尾 https://example.com',
  ].join('\n')

  const rt1 = blocksToMarkdown(markdownToBlocks(md))
  const rt2 = blocksToMarkdown(markdownToBlocks(rt1))
  ok('blocks-roundtrip-stable', rt1 === rt2, '往返漂移')

  const blocks = markdownToBlocks(md)
  ok('blocks-heading', blocks[0].type === 'heading' && blocks[0].meta.level === 1)
  ok('blocks-todo-checked', blocks.some((b) => b.type === 'todo' && b.meta.checked === true))
  ok('blocks-todo-unchecked', blocks.some((b) => b.type === 'todo' && b.meta.checked === false))
  ok('blocks-nested-depth', blocks.some((b) => b.type === 'bullet' && b.depth === 1))
  ok('blocks-code-lang', blocks.some((b) => b.type === 'code' && b.meta.lang === 'js'))
  ok('blocks-divider', blocks.some((b) => b.type === 'divider'))
  ok('blocks-empty-fallback', markdownToBlocks('').length === 1)

  // Callout 高亮块（Obsidian 语法 > [!type]）：解析 + 往返 + 类型归一化
  {
    const cmd = [
      '> [!note] 这是一条信息',
      '',
      '> [!tip] 小贴士',
      '',
      '> [!warning] 注意',
      '',
      '> [!danger] 危险',
    ].join('\n')
    const cb = markdownToBlocks(cmd)
    ok('callout-parse-count', cb.filter((b) => b.type === 'callout').length === 4)
    ok('callout-note-type', cb[0].type === 'callout' && cb[0].meta.callout === 'note' && cb[0].text === '这是一条信息')
    ok('callout-tip-type', cb.some((b) => b.type === 'callout' && b.meta.callout === 'tip'))
    ok('callout-warning-type', cb.some((b) => b.type === 'callout' && b.meta.callout === 'warning'))
    ok('callout-danger-type', cb.some((b) => b.type === 'callout' && b.meta.callout === 'danger'))
    const crt1 = blocksToMarkdown(markdownToBlocks(cmd))
    const crt2 = blocksToMarkdown(markdownToBlocks(crt1))
    ok('callout-roundtrip-stable', crt1 === crt2, '往返漂移')
    // 别名归一化：success→tip、important→note、caution→warning、error→danger、未知→note
    ok('callout-alias-success', markdownToBlocks('> [!success] 好')[0].meta.callout === 'tip')
    ok('callout-alias-important', markdownToBlocks('> [!important] 重')[0].meta.callout === 'note')
    ok('callout-alias-caution', markdownToBlocks('> [!caution] 慎')[0].meta.callout === 'warning')
    ok('callout-alias-error', markdownToBlocks('> [!error] 错')[0].meta.callout === 'danger')
    ok('callout-alias-unknown', markdownToBlocks('> [!zzz] 未知')[0].meta.callout === 'note')
    // 多行正文并入一行；普通引用不被误判为 callout
    const multi = markdownToBlocks('> [!info] 第一行\n> 第二行')
    ok('callout-multiline-merge', multi[0].type === 'callout' && multi[0].text === '第一行 第二行')
    ok('callout-plain-quote-untouched', markdownToBlocks('> 普通引用')[0].type === 'quote')
  }

  // 首个 H1 与标题重复 → 渲染层去重判定（vault: title 来自文件名、正文仍留 # 标题）
  {
    const hit = markdownToBlocks('# 我的笔记\n\n正文')
    ok('duph1-match', firstHeadingMatchesTitle(hit, '我的笔记') === true)
    ok('duph1-match-trim', firstHeadingMatchesTitle(hit, '  我的笔记 ') === true)
    ok('duph1-diff-title', firstHeadingMatchesTitle(hit, '别的标题') === false)
    ok('duph1-empty-title', firstHeadingMatchesTitle(hit, '') === false)
    // 行内标记：H1 文本剥标记后再比（**我的**笔记 → 我的笔记）
    ok('duph1-inline-strip', firstHeadingMatchesTitle(markdownToBlocks('# **我的**笔记'), '我的笔记') === true)
    // H2 不算、非标题首块不算、无块不算
    ok('duph1-h2-no', firstHeadingMatchesTitle(markdownToBlocks('## 我的笔记'), '我的笔记') === false)
    ok('duph1-para-no', firstHeadingMatchesTitle(markdownToBlocks('我的笔记'), '我的笔记') === false)
    ok('duph1-empty-blocks', firstHeadingMatchesTitle([], '我的笔记') === false)
  }

  // GFM 表格：解析 + 往返 + 对齐 + 转义 + 规整
  {
    const tmd = [
      '| 名称 | 数量 | 备注 |',
      '| :--- | ---: | :---: |',
      '| 苹果 | 3 | 甜 |',
      '| 香蕉 | 12 | 有点软 |',
    ].join('\n')
    const tb = markdownToBlocks(tmd)
    ok('table-parse-type', tb[0].type === 'table')
    ok('table-parse-rows', tb[0].meta.rows.length === 3 && tb[0].meta.rows[0].length === 3)
    ok('table-parse-header', tb[0].meta.rows[0][0] === '名称' && tb[0].meta.rows[1][1] === '3')
    ok('table-parse-align', JSON.stringify(tb[0].meta.align) === JSON.stringify(['left', 'right', 'center']))
    const trt1 = blocksToMarkdown(markdownToBlocks(tmd))
    const trt2 = blocksToMarkdown(markdownToBlocks(trt1))
    ok('table-roundtrip-stable', trt1 === trt2, '往返漂移')
    ok('table-roundtrip-keeps-align', /:---/.test(trt1) && /---:/.test(trt1) && /:---:/.test(trt1))
    // 转义竖线
    const esc = markdownToBlocks('| a | b |\n| --- | --- |\n| x \\| y | z |')
    ok('table-escaped-pipe', esc[0].meta.rows[1][0] === 'x | y')
    ok('table-escaped-pipe-rt', blocksToMarkdown(esc).includes('x \\| y'))
    // 参差行补齐到表头列数
    const ragged = markdownToBlocks('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |')
    ok('table-ragged-pad', ragged[0].meta.rows[1].length === 3 && ragged[0].meta.rows[1][2] === '')
    // 缺分隔行 → 不是表格（退回段落）
    ok('table-needs-separator', markdownToBlocks('| a | b |\n普通文字')[0].type !== 'table')
    // 表格与前后段落间有空行、往返稳定
    const mixed = '前言\n\n| h |\n| --- |\n| v |\n\n结尾'
    ok('table-mixed-stable', blocksToMarkdown(markdownToBlocks(mixed)) === blocksToMarkdown(markdownToBlocks(blocksToMarkdown(markdownToBlocks(mixed)))))
  }

  // 图片块：独占一行 ![alt](src) 成块 + 往返稳定
  {
    const ib = markdownToBlocks('![猫](https://ex.com/c.png)')
    ok('image-parse-type', ib[0].type === 'image')
    ok('image-parse-alt', ib[0].text === '猫')
    ok('image-parse-src', ib[0].meta.src === 'https://ex.com/c.png')
    const irt1 = blocksToMarkdown(markdownToBlocks('![猫](https://ex.com/c.png)'))
    const irt2 = blocksToMarkdown(markdownToBlocks(irt1))
    ok('image-roundtrip-stable', irt1 === irt2 && irt1 === '![猫](https://ex.com/c.png)', irt1)
    // 空 alt 也往返
    ok('image-empty-alt', blocksToMarkdown(markdownToBlocks('![](https://ex.com/x.png)')) === '![](https://ex.com/x.png)')
    // 行内图片（非独占行）不成块，留在段落里
    ok('image-inline-not-block', markdownToBlocks('看这张 ![x](https://a/b.png) 图')[0].type === 'paragraph')
    // 图片与前后段落往返稳定
    const imix = '前言\n\n![图](https://a/b.png)\n\n结尾'
    ok('image-mixed-stable', blocksToMarkdown(markdownToBlocks(imix)) === blocksToMarkdown(markdownToBlocks(blocksToMarkdown(markdownToBlocks(imix)))))
  }

  // 行内 md ⇄ 可编辑 HTML 往返（落盘不损坏）
  const inlineCases = [
    '普通文本',
    '**加粗**收尾',
    '中间 *斜体* 词',
    '`inline code`',
    'a **b** c *d* e ~~f~~ g',
    '高亮 ==重点== 收尾',
    'a **b** ==c== ~~d~~ e',
    '[[目标]]',
    '[[目标|显示名]]',
    '[label](https://x.com)',
    '裸链 https://a.b/c 结束',
    '嵌套 **粗里 *斜* 混** 尾',
    '特殊 < > & " 字符',
  ]
  for (const c of inlineCases) {
    ok(`inline-roundtrip: ${c}`, htmlInlineToMd(mdInlineToHtml(c)) === c)
  }

  // 行内 XSS：脚本被转义、不放行原始 HTML
  ok('inline-xss', !mdInlineToHtml('<img src=x onerror=alert(1)>').includes('<img'))

  // input-rule 即时转换
  ok('rule-bold', matchInlineRule('打 **粗**')?.html === '<strong>粗</strong>')
  ok('rule-code', matchInlineRule('x `y`')?.html === '<code>y</code>')
  ok('rule-none', matchInlineRule('没有标记') === null)

  // 纯文本抽取（搜索/摘要）
  ok('plain-strip', inlineToPlainText('**粗** [[A|别名]] `c`') === '粗 别名 c')

  // 列表预览摘要：块级 + 行内标记全剥（列表/时间线/相关笔记复用，不许露裸 markdown）
  const excerptSrc = '# 标题\n\n正文 **加粗** 和 *斜体*，[[双链]]。\n\n- 项目一\n- 项目二\n\n> 引用一句'
  const ex = plainExcerpt(excerptSrc, 200)
  ok('excerpt-no-heading-hash', !ex.includes('#'))
  ok('excerpt-no-bold-marks', !ex.includes('**'))
  ok('excerpt-no-list-dash', !ex.includes('- 项目'))
  ok('excerpt-no-wikilink-brackets', !ex.includes('[['))
  ok('excerpt-keeps-text', ex.includes('标题') && ex.includes('加粗') && ex.includes('双链'))
  ok('excerpt-truncates', plainExcerpt('字'.repeat(500), 50).length === 50)
  ok('excerpt-skips-code-block', !plainExcerpt('正文\n\n```js\nconst x=1\n```', 200).includes('const x'))
}

/* ===== analytics：条目 → 图表数据（确定性时间分桶）===== */
{
  const DAY = 86400000
  const WEEK = 7 * DAY
  const now = new Date('2026-07-16T12:00:00').getTime()
  const items = [
    { type: 'note', tags: ['a', 'b'], createdAt: now - 1 * DAY },
    { type: 'note', tags: ['a'], createdAt: now - 2 * DAY },
    { type: 'link', tags: ['a', 'c'], createdAt: now - 10 * DAY },
    { type: 'clip', tags: [], createdAt: now - 40 * DAY },
    { type: 'note', tags: ['b'], createdAt: now - 3 * WEEK - 2 * DAY },
  ]

  const tb = typeBreakdown(items)
  ok('analytics-type', tb.note === 3 && tb.link === 1 && tb.clip === 1)

  const tags = topTags(items, 3)
  ok('analytics-toptags-order', tags[0].label === 'a' && tags[0].value === 3)
  ok('analytics-toptags-cap', topTags(items, 2).length === 2)

  const g = growthSeries(items, { now, weeks: 6 })
  ok('analytics-growth-len', g.labels.length === 6 && g.values.length === 6)
  ok('analytics-growth-cumulative', g.values[5] === 5 && g.values[0] <= g.values[5])

  const wc = weeklyCounts(items, { now, weeks: 6 })
  ok('analytics-weekly-thisweek', wc[wc.length - 1] === 2)

  const heat = activityHeatmap(items, { now, weeks: 8 })
  ok('analytics-heat-shape', heat.values.length === 7 && heat.values[0].length === 8)
  ok('analytics-heat-future-null', heat.values.some((row) => row.includes(null)))

  const snap = snapshot(items, { now })
  ok('analytics-snapshot', snap.total === 5 && snap.week === 2 && snap.tags === 3)
  ok('analytics-empty', snapshot([], { now }).total === 0 && typeBreakdown([]).note === 0)

  // 列表分组：置顶 / 今天 / 昨天 / 本周 / 更早
  const gItems = [
    { pinned: true, updatedAt: now - 40 * DAY },
    { pinned: false, updatedAt: now - 1 * 3600000 }, // 今天
    { pinned: false, updatedAt: now - 1 * DAY - 1 * 3600000 }, // 昨天
    { pinned: false, updatedAt: now - 3 * DAY }, // 本周
    { pinned: false, updatedAt: now - 20 * DAY }, // 更早
  ]
  const groups = groupNotes(gItems, { now })
  ok('group-keys-order', groups.map((g) => g.key).join(',') === 'pinned,today,yesterday,week,older')
  ok('group-pinned-first', groups[0].key === 'pinned' && groups[0].items.length === 1)
  ok('group-skips-empty', groupNotes([{ pinned: false, updatedAt: now }], { now }).length === 1)
  ok('group-empty', groupNotes([], { now }).length === 0)

  // 标签色：稳定、返回 hue var
  ok('tagcolor-stable', tagHueVar('工作') === tagHueVar('工作'))
  ok('tagcolor-var', /^var\(--chart-hue-\w+\)$/.test(tagHueVar('读书')))
}

console.log(`knowledge-unit: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
