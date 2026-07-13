/**
 * Life OS 设置持久化样板的唯一真源（PLAT.CORE.4 提取）。
 * app 侧用法（Svelte 5 runes 留在 app）：
 *
 *   const persistence = createSettingsPersistence({ key: 'xxos_v1', defaults: DEFAULTS })
 *   export const S = $state(persistence.load())
 *   export const save = () => persistence.save(S)
 *
 * @template T
 * @param {{
 *   key: string,
 *   defaults: T,
 *   merge?: (parsed: unknown, defaults: T) => T,
 *   serialize?: (value: T) => unknown,
 * }} options
 * `merge` 缺省为「defaults 浅合并 parsed，settings 字段再浅合并一层」——
 * 覆盖它来做 schema 迁移。`serialize` 缺省存整个对象。
 */
export function createSettingsPersistence({ key, defaults, merge, serialize }) {
  const cloneDefaults = () => structuredClone(defaults)

  const defaultMerge = (parsed, base) => {
    if (!parsed || typeof parsed !== 'object') return base
    const merged = { ...base, ...parsed }
    if (
      base &&
      typeof base === 'object' &&
      'settings' in base &&
      parsed &&
      typeof parsed === 'object' &&
      'settings' in parsed
    ) {
      merged.settings = { ...base.settings, ...parsed.settings }
    }
    return merged
  }

  function load() {
    if (typeof localStorage === 'undefined') return cloneDefaults()
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return cloneDefaults()
      const parsed = JSON.parse(raw)
      return (merge ?? defaultMerge)(parsed, cloneDefaults())
    } catch {
      return cloneDefaults()
    }
  }

  /** @param {T} value */
  function save(value) {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        key,
        JSON.stringify(serialize ? serialize(value) : value),
      )
    } catch {}
  }

  return { load, save }
}
