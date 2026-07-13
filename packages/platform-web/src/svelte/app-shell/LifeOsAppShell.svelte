<script>
  import { onMount, tick } from 'svelte'
  import { getPersistentOverlayInset } from './appShell.js'
  import './app-shell.css'

  /** @typedef {'desktop' | 'mobile'} LifeOsNavigationProjection */
  /** @typedef {'content' | 'document'} LifeOsScrollMode */
  /** @typedef {'main' | 'preserve'} LifeOsFocusOnNavigate */

  /**
   * @type {{
   *   header?: import('svelte').Snippet,
   *   navigation?: import('svelte').Snippet<[LifeOsNavigationProjection]>,
   *   main?: import('svelte').Snippet,
   *   children?: import('svelte').Snippet,
   *   persistentOverlay?: import('svelte').Snippet,
   *   transientOverlay?: import('svelte').Snippet,
   *   scrollMode?: LifeOsScrollMode,
   *   navigationKey?: string,
   *   focusOnNavigate?: LifeOsFocusOnNavigate,
   *   mainId?: string,
   *   mainLabel?: string,
   *   skipLinkLabel?: string,
   *   testIdPrefix?: string
   * }}
   */
  let {
    header,
    navigation,
    main,
    children,
    persistentOverlay,
    transientOverlay,
    scrollMode = 'content',
    navigationKey,
    focusOnNavigate = 'preserve',
    mainId = 'main-content',
    mainLabel,
    skipLinkLabel = 'Skip to content',
    testIdPrefix = 'life-os-app-shell',
  } = $props()

  let shellElement
  let mainElement
  let persistentOverlayElement
  let transientOverlayElement
  let previousNavigationKey = $state()
  let hasNavigationKey = $state(false)

  const mainContent = $derived(main ?? children)

  function focusIsProtected(activeElement) {
    if (!(activeElement instanceof HTMLElement)) return false
    return Boolean(
      activeElement.matches('input, textarea, select, [contenteditable="true"]') ||
        activeElement.closest('form, dialog, [role="dialog"], [aria-modal="true"]'),
    )
  }

  async function focusMainAfterNavigation() {
    await tick()
    const activeElement = document.activeElement
    if (focusIsProtected(activeElement)) return
    mainElement?.focus({ preventScroll: true })
  }

  $effect(() => {
    const nextNavigationKey = navigationKey
    if (!hasNavigationKey) {
      previousNavigationKey = nextNavigationKey
      hasNavigationKey = true
      return
    }
    if (nextNavigationKey === previousNavigationKey) return
    previousNavigationKey = nextNavigationKey
    if (focusOnNavigate === 'main') void focusMainAfterNavigation()
  })

  onMount(() => {
    if (!persistentOverlayElement || !shellElement) return

    const updatePersistentInset = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const rectangles = []
      for (const element of persistentOverlayElement.children) {
        if (!(element instanceof HTMLElement)) continue
        const style = getComputedStyle(element)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0
        ) {
          continue
        }
        rectangles.push(element.getBoundingClientRect())
      }
      const obstruction = getPersistentOverlayInset(viewportHeight, rectangles)
      shellElement.style.setProperty(
        '--life-os-persistent-overlay-inset',
        `${obstruction}px`,
      )
    }

    const resizeObserver = new ResizeObserver(updatePersistentInset)
    const observeChildren = () => {
      resizeObserver.disconnect()
      for (const element of persistentOverlayElement.children) {
        if (element instanceof HTMLElement) resizeObserver.observe(element)
      }
      updatePersistentInset()
    }
    const mutationObserver = new MutationObserver(observeChildren)
    mutationObserver.observe(persistentOverlayElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })
    window.visualViewport?.addEventListener('resize', updatePersistentInset)
    window.addEventListener('resize', updatePersistentInset)
    observeChildren()

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.visualViewport?.removeEventListener('resize', updatePersistentInset)
      window.removeEventListener('resize', updatePersistentInset)
    }
  })

  onMount(() => {
    if (!transientOverlayElement || !shellElement) return

    const updateTransientState = () => {
      const hasVisibleModal = Array.from(
        document.body.querySelectorAll(
          'dialog[open], [role="dialog"][aria-modal="true"], [aria-modal="true"]',
        ),
      ).some((element) => {
        if (!(element instanceof HTMLElement)) return false
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        )
      })
      shellElement.toggleAttribute('data-transient-overlay-open', hasVisibleModal)
    }

    const observer = new MutationObserver(updateTransientState)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-modal'],
    })
    window.addEventListener('resize', updateTransientState)
    updateTransientState()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateTransientState)
    }
  })
</script>

<a class="life-os-app-shell__skip-link" href={`#${mainId}`}>
  {skipLinkLabel}
</a>

<div
  bind:this={shellElement}
  class="life-os-app-shell app-shell"
  data-scroll-mode={scrollMode}
  data-testid={testIdPrefix}
>
  <div class="safari-chrome-tint-top" aria-hidden="true"></div>
  <div class="safari-chrome-tint-bottom" aria-hidden="true"></div>

  <div
    class="life-os-app-shell__navigation life-os-app-shell__navigation--desktop"
    data-testid={`${testIdPrefix}-navigation-desktop`}
  >
    {@render navigation?.('desktop')}
  </div>

  <div class="life-os-app-shell__column main-wrap" data-mobile-chrome="tabbar">
    <div
      class="life-os-app-shell__header"
      data-testid={`${testIdPrefix}-header`}
    >
      {@render header?.()}
    </div>

    <main
      bind:this={mainElement}
      id={mainId}
      class="life-os-app-shell__main life-os-scroll-surface"
      aria-label={mainLabel}
      tabindex="-1"
      data-testid={`${testIdPrefix}-main`}
    >
      {@render mainContent?.()}
      <div class="life-os-app-shell__overlay-spacer" aria-hidden="true"></div>
    </main>
  </div>

  <div
    class="life-os-app-shell__navigation life-os-app-shell__navigation--mobile bottom-shell"
    data-testid={`${testIdPrefix}-navigation-mobile`}
  >
    {@render navigation?.('mobile')}
  </div>

  <div
    bind:this={persistentOverlayElement}
    class="life-os-app-shell__persistent-overlay"
    data-testid={`${testIdPrefix}-persistent-overlay`}
  >
    {@render persistentOverlay?.()}
  </div>

  <div
    bind:this={transientOverlayElement}
    class="life-os-app-shell__transient-overlay"
    data-testid={`${testIdPrefix}-transient-overlay`}
  >
    {@render transientOverlay?.()}
  </div>
</div>
