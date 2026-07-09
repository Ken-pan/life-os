// 端口自 src/store/store.tsx 的 uid() helper：跨 finance/cashflow/events 等新建条目复用。
/** @param {string} prefix @returns {string} */
export function uid(prefix) {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}
