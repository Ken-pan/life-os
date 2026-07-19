<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'

  onMount(() => {
    const suffix = `${location.search}${location.hash}`
    void goto(`/assistant${suffix}`, { replaceState: true })
  })
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Compatibility route</p>
      <h1>Assistant</h1>
      <p class="control-page-intro">旧 `/chat` 链接正在安全迁移到 `/assistant`。</p>
    </div>
  </header>
  <p class="control-notice"><a href="/assistant">如果没有自动进入，请打开 Assistant。</a></p>
</div>
