/**
 * DOM extraction utilities — loaded before capture.js in page context.
 */
;(function initWsdCore() {
  const SENSITIVE_INPUT_TYPES = new Set([
    'password',
    'email',
    'tel',
    'number',
    'hidden',
  ])

  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false
    const style = window.getComputedStyle(el)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    )
      return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function redactValue(el) {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    if (SENSITIVE_INPUT_TYPES.has(type)) return '[redacted]'
    if (el.getAttribute('autocomplete') === 'cc-number') return '[redacted]'
    const val = el.value
    if (!val) return ''
    return val.length > 120 ? val.slice(0, 120) + '…' : val
  }

  function getAccessibleName(el) {
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
      if (parts.length) return parts.join(' ')
    }
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) return ariaLabel.trim()
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (label?.textContent) return label.textContent.trim()
    }
    if (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT'
    ) {
      const placeholder = el.getAttribute('placeholder')
      if (placeholder) return placeholder.trim()
    }
    const text = el.textContent?.trim()
    return text && text.length <= 200 ? text : ''
  }

  function cssPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return ''
    const parts = []
    let node = el
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
      let part = node.tagName.toLowerCase()
      if (node.id) {
        part += `#${CSS.escape(node.id)}`
        parts.unshift(part)
        break
      }
      const testId = node.getAttribute('data-testid')
      if (testId) {
        part += `[data-testid="${testId.replace(/"/g, '\\"')}"]`
        parts.unshift(part)
        break
      }
      const parent = node.parentElement
      if (parent) {
        const siblings = [...parent.children].filter(
          (c) => c.tagName === node.tagName,
        )
        if (siblings.length > 1)
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(' > ')
  }

  /** data-testid > aria-label > role+name > id > css-path */
  function buildSelectorCandidates(el) {
    const candidates = []
    const testId = el.getAttribute('data-testid')
    if (testId) {
      candidates.push({
        strategy: 'data-testid',
        value: `[data-testid="${testId}"]`,
        score: 100,
      })
    }
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) {
      const tag = el.tagName.toLowerCase()
      candidates.push({
        strategy: 'aria-label',
        value: `${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`,
        score: 85,
      })
    }
    const name = getAccessibleName(el)
    const role = el.getAttribute('role')
    if (role && name) {
      candidates.push({
        strategy: 'role+name',
        value: `[role="${role}"][aria-label="${name.replace(/"/g, '\\"')}"]`,
        score: 75,
      })
    }
    if (el.id) {
      candidates.push({
        strategy: 'id',
        value: `#${CSS.escape(el.id)}`,
        score: 70,
      })
    }
    const path = cssPath(el)
    if (path) candidates.push({ strategy: 'css-path', value: path, score: 20 })
    candidates.sort((a, b) => b.score - a.score)
    return candidates
  }

  function bestSelector(el) {
    const c = buildSelectorCandidates(el)
    return c[0]?.value || cssPath(el)
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    }
  }

  function collectMeta() {
    return [...document.querySelectorAll('meta[name], meta[property]')]
      .map((m) => ({
        name: m.getAttribute('name') || m.getAttribute('property') || '',
        content: (m.getAttribute('content') || '').slice(0, 500),
      }))
      .filter((m) => m.name)
  }

  function collectHeadings() {
    const deep = window.__WSD_DEEP_DOM__
    const nodes = deep
      ? deep.deepQueryAll('h1,h2,h3,h4,h5,h6')
      : [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    return nodes.filter(isVisible).map((h) => ({
      level: Number(h.tagName[1]),
      text: h.textContent?.trim().slice(0, 300) || '',
      selector: cssPath(h),
      bestSelector: bestSelector(h),
    }))
  }

  function collectLinks(limit = 200) {
    const deep = window.__WSD_DEEP_DOM__
    const nodes = deep
      ? deep.deepQueryAll('a[href]')
      : [...document.querySelectorAll('a[href]')]
    const out = []
    for (const a of nodes) {
      if (!isVisible(a)) continue
      const text = a.textContent?.trim().slice(0, 200) || ''
      if (!text && !a.getAttribute('aria-label')) continue
      out.push({
        text: text || a.getAttribute('aria-label') || '',
        href: a.href,
        selector: cssPath(a),
        bestSelector: bestSelector(a),
        rect: rectOf(a),
      })
      if (out.length >= limit) break
    }
    return out
  }

  function collectControls(limit = 300) {
    const sel =
      'button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="textbox"]'
    const deep = window.__WSD_DEEP_DOM__
    const nodes = deep
      ? deep.deepQueryAll(sel)
      : [...document.querySelectorAll(sel)]
    const fw = window.__WSD_FRAMEWORK__
    const out = []
    for (const el of nodes) {
      if (!isVisible(el)) continue
      const tag = el.tagName.toLowerCase()
      const role = el.getAttribute('role') || tag
      const candidates = buildSelectorCandidates(el)
      out.push({
        tag,
        role,
        type: el.getAttribute('type') || undefined,
        name: getAccessibleName(el),
        selector: cssPath(el),
        bestSelector: candidates[0]?.value,
        selectorCandidates: candidates,
        value:
          tag === 'input' || tag === 'textarea' || tag === 'select'
            ? redactValue(el)
            : undefined,
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        checked: el.checked ?? undefined,
        ariaExpanded: el.getAttribute('aria-expanded') || undefined,
        rect: rectOf(el),
        componentHint: fw?.getComponentHint?.(el),
        inShadowDom: el.getRootNode?.() instanceof ShadowRoot || undefined,
      })
      if (out.length >= limit) break
    }
    return out
  }

  function collectElements(limit = 400) {
    const deep = window.__WSD_DEEP_DOM__
    const fw = window.__WSD_FRAMEWORK__
    const out = []
    const source = deep
      ? deep.walkElements(document.body)
      : (function* () {
          const w = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
          )
          while (w.nextNode()) yield w.currentNode
        })()

    for (const el of source) {
      if (out.length >= limit) break
      if (!isVisible(el)) continue
      const role = el.getAttribute('role')
      const name = getAccessibleName(el)
      const text =
        el.childElementCount === 0 ? el.textContent?.trim().slice(0, 160) : ''
      const testId = el.getAttribute('data-testid') || undefined
      if (!role && !name && !text && !testId) continue
      if (
        ['script', 'style', 'svg', 'path', 'noscript'].includes(
          el.tagName.toLowerCase(),
        )
      )
        continue
      out.push({
        tag: el.tagName.toLowerCase(),
        role: role || undefined,
        name: name || undefined,
        text: text || undefined,
        testId,
        selector: cssPath(el),
        bestSelector: bestSelector(el),
        rect: rectOf(el),
        componentHint: fw?.getComponentHint?.(el),
        inShadowDom: el.getRootNode?.() instanceof ShadowRoot || undefined,
      })
    }
    return out
  }

  function collectForms(limit = 30) {
    const deep = window.__WSD_DEEP_DOM__
    const forms = deep
      ? deep.deepQueryAll('form')
      : [...document.querySelectorAll('form')]
    const fieldSel =
      'input, select, textarea, [role="textbox"], [role="combobox"]'
    const out = []
    for (const form of forms) {
      const fields = []
      const fieldIter = deep
        ? [...deep.walkElements(form)].filter((el) => el.matches?.(fieldSel))
        : [...form.querySelectorAll(fieldSel)]
      for (const el of fieldIter) {
        if (!isVisible(el)) continue
        const tag = el.tagName.toLowerCase()
        fields.push({
          tag,
          type: el.getAttribute('type') || tag,
          name: el.getAttribute('name') || undefined,
          id: el.id || undefined,
          label: getAccessibleName(el),
          required: el.required || el.getAttribute('aria-required') === 'true',
          disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
          value:
            tag === 'input' || tag === 'textarea' || tag === 'select'
              ? redactValue(el)
              : undefined,
          bestSelector: bestSelector(el),
        })
      }
      out.push({
        id: form.id || undefined,
        name:
          form.getAttribute('name') ||
          form.getAttribute('aria-label') ||
          undefined,
        action: form.action || undefined,
        method: (form.method || 'get').toLowerCase(),
        fields,
      })
      if (out.length >= limit) break
    }
    return out
  }

  function simplifyDomTree(node, depth = 0, maxDepth = 6, root = null) {
    if (!node || depth > maxDepth) return null
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim()
      return t ? { type: 'text', text: t.slice(0, 120) } : null
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const tag = node.tagName.toLowerCase()
    if (['script', 'style', 'noscript', 'svg'].includes(tag)) return null
    if (!isVisible(node) && depth > 0) return null

    const children = []
    for (const child of node.childNodes) {
      const simplified = simplifyDomTree(child, depth + 1, maxDepth, root)
      if (simplified) children.push(simplified)
    }
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.children) {
        const simplified = simplifyDomTree(child, depth + 1, maxDepth, root)
        if (simplified) {
          simplified.shadow = true
          children.push(simplified)
        }
      }
    }

    const name = getAccessibleName(node)
    const entry = {
      tag,
      role: node.getAttribute('role') || undefined,
      name: name || undefined,
      id: node.id || undefined,
      testId: node.getAttribute('data-testid') || undefined,
      className:
        typeof node.className === 'string'
          ? node.className.split(/\s+/).slice(0, 5).join(' ')
          : undefined,
      componentHint: window.__WSD_FRAMEWORK__?.getComponentHint?.(node),
    }
    if (children.length) entry.children = children.slice(0, 40)
    return entry
  }

  function storageKeys(storage) {
    const keys = []
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i))
    return keys.sort()
  }

  function getStorageKeyNames(kind) {
    try {
      const storage =
        kind === 'local' ? window.localStorage : window.sessionStorage
      return storageKeys(storage)
    } catch {
      return []
    }
  }

  function waitForQuiescence(timeoutMs = 2000, quietMs = 500) {
    return new Promise((resolve) => {
      let quietTimer = null
      let hardTimer = null
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer)
        quietTimer = setTimeout(finish, quietMs)
      })
      function finish() {
        observer.disconnect()
        clearTimeout(quietTimer)
        clearTimeout(hardTimer)
        resolve({ quietMs, timedOut: false })
      }
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      quietTimer = setTimeout(finish, quietMs)
      hardTimer = setTimeout(() => {
        observer.disconnect()
        clearTimeout(quietTimer)
        resolve({ quietMs: timeoutMs, timedOut: true })
      }, timeoutMs)
    })
  }

  function extractBaseSnapshot(quiescence) {
    const deep = window.__WSD_DEEP_DOM__
    const framework = window.__WSD_FRAMEWORK__?.detectFramework?.() || {
      name: 'unknown',
    }
    return {
      schema: 'web-state-devtools/snapshot/v1',
      capturedAt: new Date().toISOString(),
      page: {
        url: location.href,
        title: document.title,
        origin: location.origin,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        documentSize: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        },
        lang: document.documentElement.lang || undefined,
      },
      captureMeta: {
        quiescence,
        shadowRootCount: deep?.countShadowRoots?.() ?? 0,
        framework,
      },
      meta: collectMeta(),
      headings: collectHeadings(),
      links: collectLinks(),
      controls: collectControls(),
      elements: collectElements(),
      forms: collectForms(),
      domTree: simplifyDomTree(document.body),
      storageKeys: {
        localStorage: getStorageKeyNames('local'),
        sessionStorage: getStorageKeyNames('session'),
      },
    }
  }

  window.__WSD_CORE__ = {
    extractBaseSnapshot,
    waitForQuiescence,
    isVisible,
    getAccessibleName,
    bestSelector,
  }
})()
