// 扩展直连落库(FINC.DIRECT.1)的 finance-core 入口。
// 经 scripts/build-extension-core.mjs 打成 vendor/fos-sync-core.js(IIFE,全局 FOS_CORE),
// background.js importScripts 加载。分类/哈希与页面完全同源——不要在扩展里手写镜像。
export {
  captureRowsToRpcPayloads,
  computeEnvelopePayloadHash,
  isCaptureEnvelope,
} from '@life-os/finance-core/extension-sync'
