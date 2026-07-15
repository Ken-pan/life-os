/**
 * 开发免登录同步:agent 的预览浏览器没有登录态,/plan 横幅(要 auth)
 * 看不到云端优化副本,以前每个窗口都得手动登录/灌数据。dev server 提供
 * /__dev/canonical-scan(vite.config.js,密钥只在 node 侧),这里在
 * DEV 且未登录时自动整包应用最新 server-optimized 副本 —— 新开的
 * localhost 窗口一进来就是最新户型。
 *
 * 照片要签名 URL(必须登录)拿不到,跳过 —— 布局/尺寸/储藏区全量到位。
 * 已登录的设备不走这条(横幅那条含照片,且语义一致),生产构建里
 * import.meta.env.DEV 为 false,整条路被摇树摇掉。
 */
import { auth } from './auth.svelte.js'
import { APPLIED_COPY_KEY, scanSeenValue } from './cloud-scan-report.js'
import { validateScanPayload, buildProjectFromScan } from './spatial/scan-payload.js'
import { applyCloudScan } from './state.svelte.js'
import { toast } from './ui.svelte.js'

let tried = false

export async function maybeDevSyncCanonical() {
  if (!import.meta.env.DEV || tried || typeof window === 'undefined') return
  // Playwright smoke 自己灌测试状态(先开页面再写 localStorage),
  // 异步自动同步会跟它竞态把状态换掉 —— 自动化浏览器一律不同步
  if (navigator.webdriver) return
  tried = true
  // 等登录态判定完:已登录设备交给横幅(含照片),这里不抢
  const t0 = Date.now()
  while (!auth.ready && Date.now() - t0 < 4000) {
    await new Promise((r) => setTimeout(r, 100))
  }
  if (auth.user) return
  try {
    const res = await fetch('/__dev/canonical-scan')
    if (!res.ok) return
    const row = await res.json()
    if (!row?.payload) return
    const val = scanSeenValue(row)
    if (localStorage.getItem(APPLIED_COPY_KEY) === val) return
    if (validateScanPayload(row.payload)) return
    applyCloudScan(buildProjectFromScan(row.payload))
    localStorage.setItem(APPLIED_COPY_KEY, val)
    toast(`已自动同步「${row.label || '优化副本'}」(开发模式免登录,照片略过)`)
  } catch {
    /* 端点不在或没网,保持本地状态,不打扰画图 */
  }
}
