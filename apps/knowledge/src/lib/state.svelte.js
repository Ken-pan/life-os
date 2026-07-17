import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { createSettingsPersistence } from '@life-os/platform-web/persisted-state'
import {
  isTauri,
  VAULT_ROOT,
  loadVaultItems,
  createItemFile,
  writeItemFile,
  deleteItemFile,
} from '$lib/vault.js'

/**
 * KnowledgeOS 存储双后端：
 * - 原生 Mac app（Tauri）：Vault 目录的 .md 文件即数据库（取代 Obsidian），
 *   localStorage 只存 settings；
 * - 网页/云端：条目随 settings 一起存 localStorage（云同步后续接 @life-os/sync）。
 * 条目（KItem）：{ id, type: 'note'|'link'|'clip', title, body, url, tags: string[],
 *   pinned, createdAt, updatedAt }
 */

const persistence = createSettingsPersistence({
  key: 'knowledgeos_v1',
  defaults: {
    settings: {
      theme: 'auto', // 'light' | 'dark' | 'auto'
      locale: 'zh', // 'zh' | 'en'
    },
    items: [],
  },
  // 原生模式下条目在文件系统里，绝不进 localStorage（437+ 篇会爆配额）
  serialize: (state) =>
    state.backend === 'vault'
      ? { settings: state.settings }
      : { settings: state.settings, items: state.items },
})

export const S = $state({
  ...persistence.load(),
  backend: 'local', // 'local' | 'vault'
  vaultReady: false,
  vaultError: '',
  vaultRoot: VAULT_ROOT,
})

export function save() {
  if (!browser) return
  persistence.save(S)
}

/** 原生模式启动：从 Vault 加载全部 .md（+layout onMount 调用）。 */
export async function initBackend() {
  if (!isTauri()) return
  S.backend = 'vault'
  try {
    S.items = await loadVaultItems()
    S.vaultReady = true
  } catch (e) {
    console.error('[vault] 加载失败', e)
    S.vaultError = String(e)
  }
}

/* ===== 条目 CRUD（按后端分流）===== */

const URL_RE = /^https?:\/\/\S+$/i
const TAG_RE = /#([\p{L}\p{N}_-]+)/gu

function newId() {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 从正文里抽 #tag（去重、去 #）。 */
export function extractTags(text) {
  return [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1]))]
}

function persistNew(item) {
  S.items.unshift(item)
  if (S.backend === 'vault') {
    createItemFile(item)
      .then((rel) => {
        item.id = rel
      })
      .catch((e) => console.error('[vault] 写入失败', e))
  } else {
    save()
  }
}

/**
 * 快速收集：首行为题、其余为正文；纯 URL 识别为 link；#tag 自动抽取。
 * @param {string} raw
 * @returns {string | null} 新条目 id；空输入返回 null
 */
export function captureText(raw) {
  const text = raw.trim()
  if (!text) return null
  const lines = text.split('\n')
  const first = lines[0].trim()
  const isLink = URL_RE.test(first)
  const item = {
    id: newId(),
    type: isLink ? 'link' : 'note',
    title: isLink ? first.replace(/^https?:\/\//i, '').slice(0, 80) : first.slice(0, 120),
    body: lines.slice(1).join('\n').trim(),
    url: isLink ? first : '',
    tags: extractTags(text),
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  persistNew(item)
  return item.id
}

/** 文件导入（.md/.txt 一档一条；文件名为题）。 */
export function captureFile(name, content) {
  const item = {
    id: newId(),
    type: 'clip',
    title: name.replace(/\.(md|txt|json)$/i, ''),
    body: content.slice(0, 20000),
    url: '',
    tags: extractTags(content),
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  persistNew(item)
  return item.id
}

function persistChange(item) {
  if (S.backend === 'vault') {
    writeItemFile(item)
      .then((rel) => {
        item.id = rel
      })
      .catch((e) => console.error('[vault] 保存失败', e))
  } else {
    save()
  }
}

export function updateItem(id, patch) {
  const item = S.items.find((i) => i.id === id)
  if (!item) return
  Object.assign(item, patch, { updatedAt: Date.now() })
  persistChange(item)
}

export function deleteItem(id) {
  const idx = S.items.findIndex((i) => i.id === id)
  if (idx < 0) return
  S.items.splice(idx, 1)
  if (S.backend === 'vault') {
    deleteItemFile(id).catch((e) => console.error('[vault] 删除失败', e))
  } else {
    save()
  }
}

export function togglePin(id) {
  const item = S.items.find((i) => i.id === id)
  if (!item) return
  item.pinned = !item.pinned
  item.updatedAt = Date.now()
  persistChange(item)
}

/** 顶层文件夹（vault 模式从 id 路径前缀派生；按条目数降序）。本地模式返回空。 */
export function allFolders(items = S.items) {
  const counts = new Map()
  for (const item of items) {
    const slash = item.id.indexOf('/')
    if (slash < 0) continue // 根目录或本地模式 id（k_xxx）
    const folder = item.id.slice(0, slash)
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([path, count]) => ({ path, count }))
}

/** 全部标签（按使用次数降序）。 */
export function allTags(items = S.items) {
  const counts = new Map()
  for (const item of items)
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
}

/** 按 id（vault 相对路径）取条目；检索结果 path 回链本地条目用。 */
export function itemById(id) {
  return S.items.find((i) => i.id === id) ?? null
}

/** 按标题 resolve wikilink 目标 → 条目（大小写不敏感）；找不到返回 null。 */
export function resolveWikilink(target) {
  const t = target.trim().toLowerCase()
  return (
    S.items.find((i) => i.title.toLowerCase() === t) ??
    S.items.find((i) => i.title.toLowerCase().startsWith(t)) ??
    null
  )
}

/** 反向链接：正文里用 [[本条标题]] 指向 item 的其它条目。 */
export function backlinksOf(item) {
  const title = item.title.trim().toLowerCase()
  return S.items.filter((other) => {
    if (other.id === item.id) return false
    const links = other.body.matchAll(/\[\[([^\]]+)\]\]/g)
    for (const m of links) {
      const target = m[1].split('|')[0].split('#')[0].trim().toLowerCase()
      if (target === title || title.startsWith(target)) return true
    }
    return false
  })
}

/** 关键词 + 标签过滤（大小写不敏感，题/正文/URL/标签全匹配）。 */
export function searchItems(query, activeTags) {
  const q = query.trim().toLowerCase()
  return S.items.filter((item) => {
    if (activeTags.size > 0 && ![...activeTags].every((t) => item.tags.includes(t)))
      return false
    if (!q) return true
    return (
      item.title.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
    )
  })
}

/* ===== 主题（starter 基座）===== */

const THEME_APPLY_OPTIONS = {
  themeColorFallback: { light: '#f7f6f2', dark: '#101017' },
}

/** @returns {'light'|'dark'} */
export function resolveAppTheme() {
  return resolveTheme(S.settings.theme, 'light')
}

export function applyTheme() {
  if (!browser) return
  applyResolvedTheme(resolveAppTheme(), THEME_APPLY_OPTIONS)
}

/** @returns {() => void} */
export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'light',
  )
}
