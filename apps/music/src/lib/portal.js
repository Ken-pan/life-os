/** Mount node on document.body so fixed layers reach the Dynamic Island / safe-area. */
export function portalToBody(node) {
  document.body.appendChild(node)
  return {
    destroy() {
      node.remove()
    },
  }
}
