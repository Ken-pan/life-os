import { browser } from '$app/environment'
import {
  itemFromFile,
  serializeItem,
  sanitizeTitle,
} from '$lib/frontmatter.js'

// 纯 frontmatter 函数从 $lib/frontmatter.js（零依赖、node 可测）导入并转出。
export {
  parseFrontmatter,
  patchFrontmatter,
  serializeItem,
} from '$lib/frontmatter.js'

/**
 * Vault 文件后端（Tauri 原生模式）：.md 文件即数据库，取代 Obsidian。
 * - 每条 KItem ↔ 一个 .md 文件；元数据存 YAML frontmatter（type/url/tags/pinned/created）
 * - 顶层目录名 → 标签（去掉 "030_" 类数字前缀，小写）
 * - 新收集写入 010_Inbox/；改题重命名文件；删除即删文件
 * - 编辑写回只改 KnowledgeOS 管的字段，未知 frontmatter（src-fp/aliases/自定义 type）保留
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

/* ===== fs 操作 ===== */

const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', '.trash'])

/** 有界并发 map：对 437+ 文件读取限流，避免一次性打爆 Tauri IPC。 */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length)
  let i = 0
  async function worker() {
    while (i < list.length) {
      const idx = i++
      out[idx] = await fn(list[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return out
}

export async function loadVaultItems() {
  const { readDir, readTextFile, stat } = await fs()

  // 1) 先快速遍历目录收集全部 .md 路径（目录读取本身很轻）。
  const paths = []
  async function walk(rel) {
    const abs = rel ? `${VAULT_ROOT}/${rel}` : VAULT_ROOT
    const entries = await readDir(abs)
    const subdirs = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory) subdirs.push(childRel)
      else if (/\.md$/i.test(entry.name)) paths.push(childRel)
    }
    // 子目录并发下钻
    await Promise.all(subdirs.map(walk))
  }
  await walk('')

  // 2) 有界并发读文件（并行化冷启动：437 串行 → ~并发批）。
  const items = (
    await mapLimit(paths, 24, async (rel) => {
      try {
        const [text, statInfo] = await Promise.all([
          readTextFile(`${VAULT_ROOT}/${rel}`),
          stat(`${VAULT_ROOT}/${rel}`).catch(() => null),
        ])
        return itemFromFile(rel, text, statInfo)
      } catch (e) {
        console.warn('[vault] 读取失败，跳过', rel, e)
        return null
      }
    })
  ).filter(Boolean)

  items.sort((a, b) => b.createdAt - a.createdAt)
  return items
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
  // 新建路径：显式 seed created 到 frontmatter（编辑既有笔记不会平白加 fm）。
  await writeTextFile(`${VAULT_ROOT}/${rel}`, serializeItem({ ...item, _seedCreated: true }))
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

/* ===== 项目现状感知（只读工程目录的 git 记录）===== */

const HOME = VAULT_ROOT.replace(/\/「Projects」\/Vault$/, '')

/** 笔记 frontmatter 的 path（"~/「Projects」/X"）→ 绝对路径。 */
export function resolveProjectPath(p) {
  return String(p).replace(/^~(?=\/)/, HOME).replace(/\/+$/, '')
}

/**
 * 批量读取工程目录的最近 git 活动时间（.git/logs/HEAD 尾行时间戳）。
 * 权限只开了这个文件的只读 glob（capabilities/default.json），读不到就跳过。
 * @param {string[]} paths frontmatter 里的 path 原文
 * @returns {Promise<Map<string, number>>} path 原文 → 时间戳 ms（0 = 无记录）
 */
export async function senseGitActivity(paths, parseGitHeadLog) {
  const { readTextFile, exists } = await fs()
  const out = new Map()
  await mapLimit(paths, 8, async (p) => {
    const headLog = `${resolveProjectPath(p)}/.git/logs/HEAD`
    try {
      if (!(await exists(headLog))) {
        out.set(p, 0)
        return
      }
      out.set(p, parseGitHeadLog(await readTextFile(headLog)))
    } catch {
      out.set(p, 0)
    }
  })
  return out
}

/** 全量覆写 Vault 内一个 KnowledgeOS 全权拥有的 .md（自动现状报告）。 */
export async function writeVaultFile(rel, content) {
  const { writeTextFile } = await fs()
  await writeTextFile(`${VAULT_ROOT}/${rel}`, content)
}
