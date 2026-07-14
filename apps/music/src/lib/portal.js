/**
 * Mount node on document.body so fixed layers reach the Dynamic Island / safe-area.
 * Pass `{ enabled: false }` to render in place instead — e.g. inside an overlay
 * card that must move together with a drag transform.
 * @param {HTMLElement} node
 * @param {{ enabled?: boolean }} [opts]
 */
export function portalToBody(node, opts = {}) {
  if (opts.enabled === false) return {}
  document.body.appendChild(node)
  return {
    destroy() {
      node.remove()
    },
  }
}
