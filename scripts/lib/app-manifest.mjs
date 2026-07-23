/**
 * PLAT.GEN.1 — AppManifest 加载与校验（create / promote 共用）。
 * Schema 示例见 apps/starter/app.manifest.json。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const SHELL_TYPES = ['main-wrap-main', 'main-wrap-content', 'main-col-wrap']
const THEMES = ['light', 'dark', 'auto']
const STORAGE_KINDS = ['nested', 'direct']
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/
const ID_RE = /^[a-z][a-z0-9-]*$/
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/

const isStr = (v) => typeof v === 'string' && v.length > 0
const isBool = (v) => typeof v === 'boolean'

/**
 * @param {any} m 已解析的 manifest 对象
 * @returns {string[]} 错误列表（空 = 通过）
 */
export function validateManifest(m) {
  const e = []
  const need = (cond, msg) => cond || e.push(msg)

  need(isStr(m.id) && ID_RE.test(m.id), 'id：小写字母开头的 [a-z0-9-]')
  need(isStr(m.name), 'name：非空字符串（如 READING.OS）')
  need(isStr(m.shortName), 'shortName：非空字符串')
  need(
    m.description && isStr(m.description.zh) && isStr(m.description.en),
    'description：需要 { zh, en } 两个非空字符串',
  )
  need(
    m.themeColor && HEX_RE.test(m.themeColor.light ?? '') && HEX_RE.test(m.themeColor.dark ?? ''),
    'themeColor：需要 { light, dark } 两个 hex 颜色',
  )
  need(
    m.defaultTheme == null || THEMES.includes(m.defaultTheme),
    `defaultTheme：${THEMES.join(' | ')}`,
  )
  need(isStr(m.storageKey), 'storageKey：非空字符串（如 readingos_v1）')
  need(
    m.storageKind == null || STORAGE_KINDS.includes(m.storageKind),
    `storageKind：${STORAGE_KINDS.join(' | ')}`,
  )
  need(
    m.settingsThemePath == null || (Array.isArray(m.settingsThemePath) && m.settingsThemePath.every(isStr)),
    'settingsThemePath：字符串数组',
  )
  need(
    m.categories == null || (Array.isArray(m.categories) && m.categories.length > 0 && m.categories.every(isStr)),
    'categories：非空字符串数组',
  )
  need(isStr(m.workspace), 'workspace：非空字符串（如 reading-os）')
  need(
    Number.isInteger(m.devPort) && m.devPort >= 1024 && m.devPort <= 65535,
    'devPort：1024–65535 的整数',
  )
  need(isStr(m.domain) && DOMAIN_RE.test(m.domain), 'domain：形如 reading.kenos.space')
  need(SHELL_TYPES.includes(m.shellType), `shellType：${SHELL_TYPES.join(' | ')}`)
  need(
    m.wordmarkAccent == null ||
      (HEX_RE.test(m.wordmarkAccent.light ?? '') && HEX_RE.test(m.wordmarkAccent.dark ?? '')),
    'wordmarkAccent：需要 { light, dark } 两个 hex 颜色',
  )
  need(m.experimental == null || isBool(m.experimental), 'experimental：布尔')
  need(m.production == null || isBool(m.production), 'production：布尔')
  need(m.pwaTestEnabled == null || isBool(m.pwaTestEnabled), 'pwaTestEnabled：布尔')
  need(
    Array.isArray(m.routes) &&
      m.routes.length > 0 &&
      m.routes.every((r) => r && isStr(r.path) && r.path.startsWith('/') && isStr(r.name)),
    'routes：非空数组，每项 { path: "/..", name }',
  )
  need(
    m.clipPaths == null || (Array.isArray(m.clipPaths) && m.clipPaths.every((p) => isStr(p) && p.startsWith('/'))),
    'clipPaths：以 / 开头的字符串数组',
  )
  need(
    m.scrollQaPath == null || (isStr(m.scrollQaPath) && m.scrollQaPath.startsWith('/')),
    'scrollQaPath：以 / 开头的字符串',
  )
  need(m.moreButton == null || isStr(m.moreButton), 'moreButton：非空字符串选择器')
  need(m.moreClose == null || isStr(m.moreClose), 'moreClose：非空字符串选择器')
  need(m.authGate == null || isBool(m.authGate), 'authGate：布尔')
  // —— PLAT.GEN.4 注册表反转字段（全部可选，缺省走派生默认） ——
  need(
    m.previewPort == null || (Number.isInteger(m.previewPort) && m.previewPort >= 1024 && m.previewPort <= 65535),
    'previewPort：1024–65535 的整数（缺省 = devPort）',
  )
  need(m.wordmarkBase == null || isStr(m.wordmarkBase), 'wordmarkBase：非空字符串（缺省 = shortName）')
  need(
    m.wordmarkAccentText == null || typeof m.wordmarkAccentText === 'string',
    'wordmarkAccentText：字符串（缺省 = "OS"；空字符串 = 无高亮段）',
  )
  need(
    m.brandAssetPrefix == null || (isStr(m.brandAssetPrefix) && m.brandAssetPrefix.startsWith('/')),
    'brandAssetPrefix：以 / 开头',
  )
  need(
    m.favicon == null ||
      (isStr(m.favicon.light) &&
        (m.favicon.id == null || isStr(m.favicon.id)) &&
        (m.favicon.dark == null || isStr(m.favicon.dark))),
    'favicon：{ light 必填, id?, dark? }',
  )
  need(
    m.appleTouchIcon == null || (isStr(m.appleTouchIcon) && m.appleTouchIcon.startsWith('/')),
    'appleTouchIcon：以 / 开头',
  )
  need(m.switcherOrder == null || Number.isInteger(m.switcherOrder), 'switcherOrder：整数（缺省 = 不进切换器）')
  need(m.registryOrder == null || Number.isInteger(m.registryOrder), 'registryOrder：整数（注册表排序）')
  need(m.pwaName == null || isStr(m.pwaName), 'pwaName：非空字符串（缺省 = name）')
  need(m.waitSelector == null || isStr(m.waitSelector), 'waitSelector：非空字符串选择器')
  need(m.mainQuery == null || isStr(m.mainQuery), 'mainQuery：非空字符串选择器')
  return e
}

/**
 * 读取并校验 apps/<id>/app.manifest.json。
 * @param {string} root repo 根目录
 * @param {string} id app id
 * @returns {{ manifest: any, errors: string[] }}
 */
export function loadManifest(root, id) {
  const p = join(root, 'apps', id, 'app.manifest.json')
  if (!existsSync(p)) return { manifest: null, errors: [`缺少 ${p}`] }
  let m
  try {
    m = JSON.parse(readFileSync(p, 'utf8'))
  } catch (err) {
    return { manifest: null, errors: [`app.manifest.json 不是合法 JSON：${err.message}`] }
  }
  const errors = validateManifest(m)
  if (m.id !== id) errors.push(`manifest.id (${m.id}) 与目录名 (${id}) 不一致`)
  return { manifest: m, errors }
}

/**
 * 扫描所有带 manifest 的 app（starter 除外）。
 * @param {string} root
 * @returns {string[]} app id 列表
 */
export function listManifestApps(root) {
  const appsDir = join(root, 'apps')
  return readdirSync(appsDir).filter(
    (d) => d !== 'starter' && existsSync(join(appsDir, d, 'app.manifest.json')),
  )
}
