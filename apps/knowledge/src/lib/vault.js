import { browser } from '$app/environment'

/**
 * Vault 文件后端（Tauri 原生模式）：.md 文件即数据库，取代 Obsidian。
 * - 每条 KItem ↔ 一个 .md 文件；元数据存 YAML frontmatter（type/url/tags/pinned/created）
 * - 顶层目录名 → 标签（去掉 "030_" 类数字前缀，小写）
 * - 新收集写入 010_Inbox/；改题重命名文件；删除即删文件
 * 网页端（无 Tauri）自动退回 localStorage 模式，见 state.svelte.js。
 */

export const VAULT_ROOT = '/Users/kenpan/「Projects」/Vault'

export function isTauri() {
  return browser && '__TAURI_INTERNALS__' in window
}

let fsPromise = null
function fs() {
  fsPromise ??= import('@tauri-apps/plugin-fs')
  return fsPromise
}

/* ===== frontmatter ===== */

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** 极简 YAML 子集解析：k: v 标量、tags 的 [a, b] 与逐行 "- x" 两种形态。 */
export function parseFrontmatter(text) {
  const m = text.match(FM_RE)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  let lastKey = null
  for (const rawLine of m[1].split(/\r?\n/)) {
    const listItem = rawLine.match(/^\s*-\s+(.+)$/)
    if (listItem && lastKey) {
      if (!Array.isArray(meta[lastKey])) meta[lastKey] = meta[lastKey] ? [meta[lastKey]] : []
      meta[lastKey].push(stripQuotes(listItem[1]))
      continue
    }
    const kv = rawLine.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    lastKey = kv[1].toLowerCase()
    const raw = kv[2].trim()
    if (raw === '') {
      meta[lastKey] = ''
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      meta[lastKey] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean)
    } else {
      meta[lastKey] = stripQuotes(raw)
    }
  }
  return { meta, body: text.slice(m[0].length) }
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, '')
}

function metaTags(meta) {
  const t = meta.tags
  if (!t) return []
  const arr = Array.isArray(t) ? t : String(t).split(/[,，]/)
  return arr.map((s) => String(s).trim().replace(/^#/, '')).filter(Boolean)
}

/** 目录段 → 标签："030_Frameworks" → "frameworks"；根目录不产标签。 */
function folderTag(relPath) {
  const seg = relPath.split('/')[0]
  if (!seg || seg.endsWith('.md')) return null
  return seg.replace(/^\d+[_-]?/, '').trim().toLowerCase().replace(/\s+/g, '-') || null
}

/* ===== item ↔ file ===== */

function itemFromFile(relPath, text, statInfo) {
  const { meta, body } = parseFrontmatter(text)
  const tags = new Set(metaTags(meta))
  const ft = folderTag(relPath)
  if (ft) tags.add(ft)
  const created = meta.created ? Date.parse(meta.created) : NaN
  return {
    id: relPath,
    type: meta.type === 'link' || meta.type === 'clip' ? meta.type : 'note',
    title: relPath.split('/').pop().replace(/\.md$/i, ''),
    body,
    url: meta.url ?? '',
    tags: [...tags],
    pinned: meta.pinned === true || meta.pinned === 'true',
    createdAt: Number.isFinite(created)
      ? created
      : (statInfo?.birthtime ? new Date(statInfo.birthtime).getTime() : Date.now()),
    updatedAt: statInfo?.mtime ? new Date(statInfo.mtime).getTime() : Date.now(),
  }
}

export function serializeItem(item) {
  const lines = ['---']
  if (item.type !== 'note') lines.push(`type: ${item.type}`)
  if (item.url) lines.push(`url: ${item.url}`)
  if (item.tags.length) lines.push(`tags: [${item.tags.join(', ')}]`)
  if (item.pinned) lines.push('pinned: true')
  lines.push(`created: ${new Date(item.createdAt).toISOString()}`)
  lines.push('---', '')
  return lines.join('\n') + item.body
}

/* ===== fs 操作 ===== */

const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', '.trash'])

export async function loadVaultItems() {
  const { readDir, readTextFile, stat } = await fs()
  const items = []

  async function walk(rel) {
    const abs = rel ? `${VAULT_ROOT}/${rel}` : VAULT_ROOT
    const entries = await readDir(abs)
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory) {
        await walk(childRel)
      } else if (/\.md$/i.test(entry.name)) {
        try {
          const [text, statInfo] = await Promise.all([
            readTextFile(`${VAULT_ROOT}/${childRel}`),
            stat(`${VAULT_ROOT}/${childRel}`).catch(() => null),
          ])
          items.push(itemFromFile(childRel, text, statInfo))
        } catch (e) {
          console.warn('[vault] 读取失败，跳过', childRel, e)
        }
      }
    }
  }

  await walk('')
  items.sort((a, b) => b.createdAt - a.createdAt)
  return items
}

function sanitizeTitle(title) {
  return (
    title.replace(/[/\\:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) ||
    'Untitled'
  )
}

/** 新建：写入 010_Inbox/，同名自动加序号；返回 id（相对路径）。 */
export async function createItemFile(item) {
  const { writeTextFile, exists, mkdir } = await fs()
  const dir = `${VAULT_ROOT}/010_Inbox`
  if (!(await exists(dir))) await mkdir(dir)
  const base = sanitizeTitle(item.title)
  let rel = `010_Inbox/${base}.md`
  let n = 2
  while (await exists(`${VAULT_ROOT}/${rel}`)) {
    rel = `010_Inbox/${base} ${n}.md`
    n += 1
  }
  await writeTextFile(`${VAULT_ROOT}/${rel}`, serializeItem(item))
  return rel
}

/** 保存：内容/元数据写回；标题变化时重命名文件；返回（可能更新的）id。 */
export async function writeItemFile(item) {
  const { writeTextFile, rename, exists } = await fs()
  let rel = item.id
  const wantBase = sanitizeTitle(item.title)
  const curBase = rel.split('/').pop().replace(/\.md$/i, '')
  if (wantBase !== curBase) {
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    let nextRel = dir ? `${dir}/${wantBase}.md` : `${wantBase}.md`
    if (!(await exists(`${VAULT_ROOT}/${nextRel}`))) {
      await rename(`${VAULT_ROOT}/${rel}`, `${VAULT_ROOT}/${nextRel}`)
      rel = nextRel
    }
  }
  await writeTextFile(`${VAULT_ROOT}/${rel}`, serializeItem(item))
  return rel
}

export async function deleteItemFile(id) {
  const { remove } = await fs()
  await remove(`${VAULT_ROOT}/${id}`)
}
