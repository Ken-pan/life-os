export const ssr = false
export const prerender = false

/**
 * 本地演示模式：仅 localhost 且 IndexedDB 库为空时，自动灌入一批 demo 音乐库，
 * 让 home/library/browse/search/playlists/liked 各页开箱即有内容。
 * 生产域名永不激活；非空库永不覆盖。await 灌库，保证页面加载时已能读到数据。
 */
export async function load() {
  const { browser } = await import('$app/environment')
  if (!browser) return {}
  try {
    const shouldSeedDemo = (await import('$lib/demoMode.js')).default
    if (!shouldSeedDemo()) return {}
    const { db, slugKey, trackWords } = await import('$lib/db.js')
    if ((await db.tracks.count()) === 0) {
      const { seedDemoLibrary } = await import('$lib/demoData.js')
      await seedDemoLibrary(db, { slugKey, trackWords })
    }
  } catch (err) {
    console.warn('[musicos] demo seed skipped:', err)
  }
  return {}
}
