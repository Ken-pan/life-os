<script>
  import { setContext } from 'svelte'
  import { ICON_REGISTRY_CONTEXT_KEY } from '@life-os/platform-web/icon-registry'
  import { ICONS } from './iconRegistry.js'

  /** @type {{ app: string, mode: string, children }} */
  let { app = 'planner', mode = 'light', children } = $props()

  setContext(ICON_REGISTRY_CONTEXT_KEY, ICONS)
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
