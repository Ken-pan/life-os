<script>
  import { LIFE_OS_SITE_META } from '@life-os/theme'
  import { ExternalLink } from '@lucide/svelte'

  const PWA_APPS = [
    { id: 'planner', url: 'https://plan.kenos.space', experimental: false },
    { id: 'finance', url: 'https://money.kenos.space', experimental: false },
    { id: 'fitness', url: 'https://training.kenos.space', experimental: false },
    { id: 'music', url: 'https://music.kenos.space', experimental: false },
    { id: 'portal', url: 'https://portal.kenos.space', experimental: false },
    { id: 'home', url: 'https://home.kenos.space', experimental: true },
  ]
</script>

<section class="portal-pwa" aria-labelledby="portal-pwa-title">
  <h2 id="portal-pwa-title" class="portal-section-label">安装到主屏幕</h2>
  <div class="settings-block portal-pwa-block">
    <p class="portal-pwa-lead">
      六站均已支持 PWA。在 Safari / Chrome
      打开对应站点后，使用「添加到主屏幕」获得接近原生 App 的体验。
    </p>
    <details class="portal-pwa-details">
      <summary>iOS（Safari）</summary>
      <ol class="portal-pwa-steps">
        <li>打开目标站点（下方链接）</li>
        <li>点分享 <strong>□↑</strong> →「添加到主屏幕」</li>
        <li>从主屏幕图标打开即为 standalone 模式</li>
      </ol>
    </details>
    <details class="portal-pwa-details">
      <summary>Android（Chrome）</summary>
      <ol class="portal-pwa-steps">
        <li>打开目标站点</li>
        <li>菜单 ⋮ →「安装应用」或「添加到主屏幕」</li>
      </ol>
    </details>
    <ul class="portal-pwa-list">
      {#each PWA_APPS as app (app.id)}
        {@const meta =
          LIFE_OS_SITE_META[
            /** @type {keyof typeof LIFE_OS_SITE_META} */ (app.id)
          ]}
        <li>
          <a
            href={app.url}
            class="portal-pwa-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>
              {meta.name}
              {#if app.experimental}
                <span class="portal-pwa-exp">实验</span>
              {/if}
            </span>
            <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
          </a>
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .portal-pwa-block {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .portal-pwa-lead {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--t2);
    line-height: 1.55;
  }

  .portal-pwa-details summary {
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--t1);
  }

  .portal-pwa-steps {
    margin: var(--space-2) 0 0;
    padding-left: var(--space-5);
    font-size: var(--text-sm);
    color: var(--t2);
    line-height: 1.55;
  }

  .portal-pwa-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .portal-pwa-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--t1);
    text-decoration: none;
    font-size: var(--text-sm);
  }

  .portal-pwa-link:hover {
    border-color: var(--border-l);
    background: var(--card-h);
  }

  .portal-pwa-exp {
    margin-inline-start: var(--space-2);
    font-size: var(--text-xs);
    color: var(--t3);
    font-weight: 500;
  }
</style>
