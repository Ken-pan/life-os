<script>
  import { ChevronRight, ExternalLink } from '@lucide/svelte'
  import { getLauncherMeta } from '$lib/apps.js'
  import { rememberApp } from '$lib/recentApp.svelte.js'

  /** @typedef {import('$lib/apps.js').LauncherAppId} LauncherAppId */

  /** @type {{
   *   app: { id: LauncherAppId, url: string, icon: string, accent: string },
   *   variant?: 'default' | 'hero',
   * }} */
  let { app, variant = 'default' } = $props()

  const meta = $derived(getLauncherMeta(app.id))
  const ariaLabel = $derived(
    `打开 ${meta.name}：${meta.description.zh}（在新标签页打开）`,
  )
</script>

<a
  href={app.url}
  class="settings-block portal-app-card"
  class:portal-app-card--hero={variant === 'hero'}
  style="--portal-app-accent: {app.accent}"
  target="_blank"
  rel="noopener noreferrer"
  aria-label={ariaLabel}
  onclick={() => rememberApp(app.id)}
>
  <span class="portal-app-mark-wrap" aria-hidden="true">
    <img class="portal-app-mark" src={app.icon} alt="" width="40" height="40" loading="lazy" />
  </span>
  <div class="portal-app-copy">
    <p class="portal-app-name">{meta.name}</p>
    <p class="portal-app-desc">{meta.description.zh}</p>
  </div>
  <span class="portal-app-trailing" aria-hidden="true">
    <ExternalLink size={14} strokeWidth={2} class="portal-app-external" />
    <ChevronRight size={18} strokeWidth={2} class="portal-app-chevron" />
  </span>
</a>
