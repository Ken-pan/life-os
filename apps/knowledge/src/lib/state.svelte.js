import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { createSettingsPersistence } from '@life-os/platform-web/persisted-state'

/**
 * KnowledgeOS 本地优先存储 v1。
 * 条目（KItem）：{ id, type: 'note'|'link'|'clip', title, body, url, tags: string[],
 *   pinned, createdAt, updatedAt }。全部存 localStorage；云同步是后续阶段
 *（接 @life-os/sync 统一 Supabase，LWW + 墓碑，同 aios 模式）。
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
  serialize: (state) => ({ settings: state.settings, items: state.items }),
})

export const S = $state(persistence.load())

export function save() {
  if (!browser) return
  persistence.save(S)
}

/* ===== 条目 CRUD ===== */

const URL_RE = /^https?:\/\/\S+$/i
const TAG_RE = /#([\p{L}\p{N}_-]+)/gu

function newId() {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 从正文里抽 #tag（去重、去 #）。 */
export function extractTags(text) {
  return [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1]))]
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
    body: (isLink ? lines.slice(1).join('\n') : lines.slice(1).join('\n')).trim(),
    url: isLink ? first : '',
    tags: extractTags(text),
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  S.items.unshift(item)
  save()
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
  S.items.unshift(item)
  save()
  return item.id
}

export function updateItem(id, patch) {
  const item = S.items.find((i) => i.id === id)
  if (!item) return
  Object.assign(item, patch, { updatedAt: Date.now() })
  save()
}

export function deleteItem(id) {
  const idx = S.items.findIndex((i) => i.id === id)
  if (idx >= 0) {
    S.items.splice(idx, 1)
    save()
  }
}

export function togglePin(id) {
  const item = S.items.find((i) => i.id === id)
  if (!item) return
  item.pinned = !item.pinned
  item.updatedAt = Date.now()
  save()
}

/** 全部标签（按使用次数降序）。 */
export function allTags(items = S.items) {
  const counts = new Map()
  for (const item of items)
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
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
