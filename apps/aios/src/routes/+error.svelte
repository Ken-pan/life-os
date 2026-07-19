<script>
  import { resolve } from '$app/paths'
  import { page } from '$app/state'

  const status = $derived(page.status || 500)
  const message = $derived.by(() => {
    const raw = page.error?.message
    if (typeof raw !== 'string' || !raw.trim()) return '请稍后再试，或返回 Today / Spaces。'
    // Avoid dumping stacks / secrets into the UI
    const oneLine = raw.replace(/\s+/g, ' ').trim()
    if (oneLine.length > 180) return `${oneLine.slice(0, 177)}…`
    if (/stack|at\s+\S+\s+\(|authorization|bearer|apikey|password/i.test(oneLine)) {
      return '页面加载失败，请稍后再试。'
    }
    return oneLine
  })
</script>

<div class="route-error" data-testid="aios-route-error">
  <h1>页面暂时无法打开</h1>
  <p class="status">状态 {status}</p>
  <p class="message">{message}</p>
  <nav class="links">
    <a href={resolve('/')}>回 Today</a>
    <a href={resolve('/spaces')}>回 Spaces</a>
  </nav>
</div>

<style>
  .route-error {
    width: min(100% - 32px, 480px);
    margin: 48px auto;
    padding: 0 0 96px;
    display: grid;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: clamp(22px, 4vw, 28px);
    letter-spacing: -0.02em;
  }
  .status,
  .message {
    margin: 0;
    color: var(--t2);
    font-size: var(--text-sm, 13px);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
  }
  .links a {
    color: var(--t1);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
