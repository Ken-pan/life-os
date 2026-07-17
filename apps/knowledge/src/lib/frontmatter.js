/**
 * Vault .md ↔ KItem 的纯函数层（零依赖，node 可直测）。
 * 从 vault.js 抽出，与 Tauri fs / $app 隔离，锁死数据完整性不变量：
 * 编辑写回绝不损坏未知 frontmatter（curator 的 src-fp、Obsidian aliases、自定义 type）。
 */

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, '')
}

/** 极简 YAML 子集解析：标量、[a, b] 内联数组、逐行 "- x" 列表。返回 meta + 原始内文 + 正文。 */
export function parseFrontmatter(text) {
  const m = text.match(FM_RE)
  if (!m) return { meta: {}, raw: null, body: text }
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
  return { meta, raw: m[1], body: text.slice(m[0].length) }
}

/**
 * 外科式修改 frontmatter：只改传入的键（值为 null 则删该行），其余行原样保留
 * （src-fp / aliases / 注释 / 字段顺序都不动）。被管理键的多行 "- item" 续行一并替换。
 */
export function patchFrontmatter(rawFm, updates) {
  const lines = rawFm != null ? rawFm.split(/\r?\n/) : []
  const managed = new Set(Object.keys(updates).map((k) => k.toLowerCase()))
  const out = []
  let skippingList = false
  for (const line of lines) {
    if (skippingList && /^\s*-\s+/.test(line)) continue
    skippingList = false
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:/)
    if (kv && managed.has(kv[1].toLowerCase())) {
      skippingList = true
      continue
    }
    out.push(line)
  }
  for (const [key, val] of Object.entries(updates)) {
    if (val != null) out.push(`${key}: ${val}`)
  }
  return out.join('\n')
}

export function metaTags(meta) {
  const t = meta.tags
  if (!t) return []
  const arr = Array.isArray(t) ? t : String(t).split(/[,，]/)
  return arr.map((s) => String(s).trim().replace(/^#/, '')).filter(Boolean)
}

/** 目录段 → 标签："030_Frameworks" → "frameworks"；根目录不产标签。 */
export function folderTag(relPath) {
  const seg = relPath.split('/')[0]
  if (!seg || seg.endsWith('.md')) return null
  return seg.replace(/^\d+[_-]?/, '').trim().toLowerCase().replace(/\s+/g, '-') || null
}

/** relPath + 文件内容 → KItem。 */
export function itemFromFile(relPath, text, statInfo) {
  const { meta, raw, body } = parseFrontmatter(text)
  const fmTags = metaTags(meta)
  const ft = folderTag(relPath)
  const tags = ft ? [...new Set([...fmTags, ft])] : fmTags
  const created = meta.created ? Date.parse(meta.created) : NaN
  const knownType = meta.type === 'link' || meta.type === 'clip' ? meta.type : 'note'
  return {
    id: relPath,
    type: knownType,
    title: relPath.split('/').pop().replace(/\.md$/i, ''),
    body,
    url: meta.url ?? '',
    tags,
    pinned: meta.pinned === true || meta.pinned === 'true',
    createdAt: Number.isFinite(created)
      ? created
      : statInfo?.birthtime
        ? new Date(statInfo.birthtime).getTime()
        : Date.now(),
    updatedAt: statInfo?.mtime ? new Date(statInfo.mtime).getTime() : Date.now(),
    _rawFm: raw,
    _folderTag: ft,
    _meta: meta,
  }
}

/**
 * 外科式更新条目的自定义 frontmatter 字段（如 status / last_updated）：
 * 同步改 _rawFm 与 _meta，保存时随 serializeItem 一并落盘。
 * 只该用在明确管理这些字段的功能（项目现状），值为 null 删除该键。
 */
export function applyMetaPatch(item, updates) {
  const patched = patchFrontmatter(item._rawFm, updates)
  item._rawFm = patched.trim() ? patched : null
  const meta = { ...(item._meta ?? {}) }
  for (const [key, val] of Object.entries(updates)) {
    const k = key.toLowerCase()
    if (val == null) delete meta[k]
    else meta[k] = String(val)
  }
  item._meta = meta
  return item
}

/**
 * KItem → .md 文本：只外科式改 tags/url/pinned，其余 frontmatter 原样保留；
 * 目录派生标签不回写；原本纯文本且无管理字段则保持纯文本。
 */
export function serializeItem(item) {
  const writeTags = item.tags.filter((tg) => tg !== item._folderTag)
  const updates = {
    tags: writeTags.length ? `[${writeTags.join(', ')}]` : null,
    url: item.url ? item.url : null,
    pinned: item.pinned ? 'true' : null,
  }
  // created 只在新建路径（_seedCreated）写入；编辑既有笔记绝不平白加 frontmatter，
  // 已有 created 也原样保留（不进管理集，避免重排）。
  const hasCreated = /^created\s*:/m.test(item._rawFm ?? '')
  if (item._seedCreated && !hasCreated) {
    updates.created = new Date(item.createdAt).toISOString()
  }
  const patched = patchFrontmatter(item._rawFm ?? null, updates)
  if (!item._rawFm && patched.trim() === '') return item.body // 纯文本笔记保持纯文本
  return `---\n${patched}\n---\n\n${item.body}`
}

/** 文件名清洗：去掉路径/YAML 不安全字符，截断。 */
export function sanitizeTitle(title) {
  return (
    title.replace(/[/\\:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) ||
    'Untitled'
  )
}
