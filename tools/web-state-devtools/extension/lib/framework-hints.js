/**
 * Framework detection + Svelte/SvelteKit component hints (dev, best-effort).
 */
;(function initWsdFrameworkHints() {
  function detectFramework() {
    if (
      document.querySelector(
        '[data-sveltekit-hydrate], [data-sveltekit-preload-data]',
      )
    ) {
      return { name: 'sveltekit' }
    }
    if (document.querySelector('[data-svelte-h]')) {
      return { name: 'svelte', version: 5 }
    }
    if (window.__SVELTEKIT_DEV__ || window.__sveltekit_dev) {
      return { name: 'sveltekit', dev: true }
    }
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      return { name: 'react' }
    }
    if (window.__VUE__) {
      return { name: 'vue' }
    }
    return { name: 'unknown' }
  }

  function getComponentHint(el) {
    let node = el
    while (node) {
      if (node.nodeType !== Node.ELEMENT_NODE) break

      const meta = node.__svelte_meta
      if (meta?.component?.name) return meta.component.name

      for (const key of Object.getOwnPropertyNames(node)) {
        if (!key.includes('svelte') && key !== '__svelte_meta') continue
        const val = node[key]
        if (val?.component?.name) return val.component.name
        if (val?.tag?.name) return val.tag.name
      }

      const fh =
        node.getAttribute?.('data-file-hint') ||
        node.getAttribute?.('data-component')
      if (fh) return fh

      node = node.parentElement
      if (!node && el.getRootNode?.() instanceof ShadowRoot) {
        node = el.getRootNode().host
        el = node
      }
    }
    return undefined
  }

  function collectComponentHints(limit = 60) {
    const deep = window.__WSD_DEEP_DOM__
    if (!deep) return []

    const out = []
    const seen = new Set()

    for (const el of deep.walkElements(document.body)) {
      const hint = getComponentHint(el)
      if (!hint || seen.has(hint)) continue
      seen.add(hint)
      out.push({
        component: hint,
        tag: el.tagName.toLowerCase(),
        bestSelector: window.__WSD_CORE__?.bestSelector?.(el),
        text: (el.textContent?.trim() || '').slice(0, 80) || undefined,
      })
      if (out.length >= limit) break
    }
    return out
  }

  window.__WSD_FRAMEWORK__ = {
    detectFramework,
    getComponentHint,
    collectComponentHints,
  }
})()
