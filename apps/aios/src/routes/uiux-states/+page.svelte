<script>
  /**
   * Local-only state matrix for Visual Rescue Round 5.
   * Does not hit production writers/flags — pure UI fixtures.
   */
  import ReadSourceState from '$lib/components/ReadSourceState.svelte'

  const fixtures = [
    { id: 'loading', state: { status: 'loading', message: '正在汇总…', retryable: false } },
    { id: 'empty', state: { status: 'empty', message: '没有可显示的条目', retryable: false } },
    { id: 'unavailable', state: { status: 'unavailable', message: '当前能力尚未开启', retryable: false } },
    { id: 'offline', state: { status: 'offline', message: '当前离线', retryable: true } },
    { id: 'error', state: { status: 'error', message: '读取失败（演示）', retryable: true } },
    { id: 'permission_denied', state: { status: 'permission_denied', message: '需要登录后读取', retryable: false } },
    { id: 'unsupported', state: { status: 'unsupported', message: '此环境不支持该读取', retryable: false } },
    { id: 'partial', state: { status: 'partial', message: '部分来源可用', retryable: true } },
    { id: 'stale', state: { status: 'stale', message: '数据可能已过期', retryable: true } },
    { id: 'ready', state: { status: 'ready', message: '已更新', retryable: false } },
  ]

  let offlineSim = $state(false)
</script>

<div class="states-page" data-testid="uiux-states">
  <header class="header">
    <div>
      <p class="kicker">UIUX · States</p>
      <h1 class="kenos-page-title">State matrix</h1>
      <p class="lede">Round 5 本地状态样板。不写生产、不改 flag。Continue 在系统栏。</p>
    </div>
  </header>

  <section class="block">
    <h2>ReadSourceState</h2>
    {#each fixtures as item (item.id)}
      <div class="fixture" data-state={item.id}>
        <p class="label">{item.id}</p>
        <ReadSourceState state={item.state} onRetry={() => {}} />
      </div>
    {/each}
  </section>

  <section class="block">
    <h2>Shell banners</h2>
    <label class="toggle">
      <input type="checkbox" bind:checked={offlineSim} />
      模拟 offline banner
    </label>
    {#if offlineSim}
      <div class="offline-banner" role="status">当前离线 · 显示已缓存内容；恢复网络后将自动重试</div>
    {/if}
  </section>

  <section class="block">
    <h2>Approval · pending / approved-not-executed</h2>
    <div class="approval-row">
      <div>
        <strong>调整明日训练计划</strong>
        <span class="meta">pending · 等待你决定</span>
      </div>
      <span class="badge">pending</span>
    </div>
    <div class="approval-row">
      <div>
        <strong>创建 Phase 2 任务</strong>
        <span class="meta">approved · 尚未执行</span>
      </div>
      <span class="badge approved">approved · not executed</span>
    </div>
  </section>

  <section class="block">
    <h2>Read-only notice</h2>
    <p class="readonly">此表面为只读。写入由领域 Owner / Approval 路径处理。</p>
  </section>
</div>

<style>
  .states-page {
    width: min(100% - 32px, var(--kenos-content-max, 820px));
    margin: 0 auto;
    padding: var(--kenos-space-page-top, 24px) 0 var(--kenos-mobile-bottom-pad, 96px);
  }
  .header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
  .kicker {
    margin: 0 0 6px;
    color: var(--t3);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .lede {
    margin: 10px 0 0;
    color: var(--t2);
    max-width: 36rem;
  }
  .quiet {
    appearance: none;
    display: none;
  }
  .block {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .block h2 {
    margin: 0 0 12px;
    font-size: var(--kenos-type-section, 17px);
  }
  .fixture {
    margin-bottom: 12px;
  }
  .label {
    margin: 0 0 4px;
    color: var(--t3);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .toggle {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--t2);
    margin-bottom: 12px;
  }
  .offline-banner {
    padding: 8px 12px;
    text-align: center;
    color: var(--warning, #d4a017);
    background: color-mix(in srgb, var(--warning, #d4a017) 20%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--warning, #d4a017) 35%, var(--border));
    border-radius: 8px;
  }
  .approval-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    min-height: 56px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .approval-row strong {
    display: block;
  }
  .meta {
    color: var(--t3);
    font-size: 13px;
  }
  .badge {
    font-size: 11px;
    font-weight: 650;
    color: var(--t2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 8px;
    white-space: nowrap;
  }
  .badge.approved {
    color: var(--positive, #3d9e6f);
  }
  .readonly {
    color: var(--t3);
    font-size: 14px;
  }
</style>
