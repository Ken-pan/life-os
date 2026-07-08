<script>
  import { setContext } from 'svelte'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { ICONS } from './iconRegistry.js'
  import { CATALOG_CONTEXT_KEY } from './catalogContext.js'

  /** @type {{ app: string, mode: string, children }} */
  let { app = 'planner', mode = 'light', children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)
  setContext(CATALOG_CONTEXT_KEY, {
    get app() {
      return app
    },
    get mode() {
      return mode
    },
  })

  /** Mirror production apps: brand + component tokens resolve on `<html data-app>`. */
  $effect(() => {
    const root = document.documentElement
    root.dataset.app = app
    root.dataset.mode = mode
    root.dataset.theme = mode
    return () => {
      delete root.dataset.app
      delete root.dataset.mode
      delete root.dataset.theme
    }
  })
</script>

<div
  class="catalog-preview"
  data-app={app}
  data-mode={mode}
  data-theme={mode}
  data-testid="catalog-shell"
>
  {@render children?.()}
</div>
