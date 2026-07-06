/**
 * Deep DOM traversal — pierce open Shadow DOM roots.
 */
;(function initWsdDeepDom() {
  /**
   * @param {ParentNode} root
   * @yields {Element}
   */
  function* walkElements(root) {
    const stack = []
    if (root instanceof Element) stack.push(root)
    else if (root instanceof Document || root instanceof DocumentFragment) {
      for (let i = root.children.length - 1; i >= 0; i--)
        stack.push(root.children[i])
    }

    while (stack.length) {
      const el = stack.pop()
      if (!el || el.nodeType !== Node.ELEMENT_NODE) continue
      yield el
      for (let i = el.children.length - 1; i >= 0; i--)
        stack.push(el.children[i])
      if (el.shadowRoot) {
        for (let i = el.shadowRoot.children.length - 1; i >= 0; i--)
          stack.push(el.shadowRoot.children[i])
      }
    }
  }

  function deepQueryAll(selector, root = document) {
    const out = []
    const seen = new Set()

    function scan(node) {
      let matches = []
      try {
        matches = node.querySelectorAll
          ? [...node.querySelectorAll(selector)]
          : []
      } catch {
        return
      }
      for (const el of matches) {
        if (!seen.has(el)) {
          seen.add(el)
          out.push(el)
        }
      }
      for (const el of walkElements(
        node instanceof Document ? document.body : node,
      )) {
        if (el.shadowRoot) scan(el.shadowRoot)
      }
    }

    scan(root)
    return out
  }

  function deepQuerySelector(selector, root = document) {
    return deepQueryAll(selector, root)[0] || null
  }

  function countShadowRoots() {
    let n = 0
    for (const el of walkElements(document.body)) {
      if (el.shadowRoot) n++
    }
    return n
  }

  window.__WSD_DEEP_DOM__ = {
    walkElements,
    deepQueryAll,
    deepQuerySelector,
    countShadowRoots,
  }
})()
