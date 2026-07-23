// 把 finance-core 的分类/哈希真源打进扩展 vendor 包(FINC.DIRECT.1)。
// 产物 extension/vendor/fos-sync-core.js 是提交进仓库的构建产物——扩展免构建加载,
// 但改动 finance-core 的 extension-sync 相关代码后必须重跑:npm run ext:build-core -w finance-os
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

await build({
  entryPoints: [path.join(root, 'extension/coreEntry.mjs')],
  bundle: true,
  format: 'iife',
  globalName: 'FOS_CORE',
  platform: 'browser',
  target: 'chrome120',
  outfile: path.join(root, 'extension/vendor/fos-sync-core.js'),
  banner: {
    js: '// 构建产物,勿手改:npm run ext:build-core -w finance-os(源 packages/finance-core/src/extension-sync.ts)',
  },
  logLevel: 'info',
})
