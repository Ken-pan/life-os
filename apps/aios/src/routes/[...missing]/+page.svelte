<script>
  import { page } from '$app/state'
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Safe fallback</p>
      <h1>这里没有页面</h1>
      <p class="control-page-intro">
        无法识别 <code>{page.url.pathname}</code>。没有执行重定向、写入或数据恢复操作。
      </p>
    </div>
  </header>
  <nav class="control-page-section fallback-links" aria-label="安全返回">
    <a class="control-button control-button--link" href="/">返回 Today</a>
    <a class="control-button control-button--link" href="/assistant">打开 Assistant</a>
  </nav>
</div>

<style>
  .fallback-links {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }
</style>
