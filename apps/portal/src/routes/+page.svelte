<script>
  import { PORTAL_APPS, getLauncherMeta } from '$lib/apps.js'
</script>

<header class="page-header">
  <div class="titles">
    <h1 class="page-title">选择应用</h1>
    <p class="subtitle">在同一账号下继续你的工作流</p>
  </div>
</header>

<div class="sec-header">
  <h2 class="sec-title">应用</h2>
  <span class="sec-count">{PORTAL_APPS.length}</span>
</div>

{#each PORTAL_APPS as app (app.id)}
  {@const meta = getLauncherMeta(app.id)}
  <a
    href={app.url}
    class="settings-block portal-app-card"
    style="--portal-app-accent: {app.accent}"
  >
    <img
      class="portal-app-mark"
      src={app.icon}
      alt=""
      width="40"
      height="40"
      loading="lazy"
    />
    <div class="portal-app-copy">
      <p class="portal-app-name">{meta.name}</p>
      <p class="portal-app-desc">{meta.description.zh}</p>
    </div>
  </a>
{/each}

<p class="portal-hint">
  按 <kbd>⌘</kbd><kbd>K</kbd> 快速跳转
</p>
