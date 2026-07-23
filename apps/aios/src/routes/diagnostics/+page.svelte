<script>
  import { onMount } from 'svelte'
  import { DIAG, loadDiagnostics, markIssue } from '$lib/kenos/diagnosticsStore.svelte.js'

  onMount(() => {
    void loadDiagnostics()
  })

  const model = $derived(DIAG.model)
  const fmt = (iso) =>
    iso
      ? new Intl.DateTimeFormat('zh-CN', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(iso))
      : '—'

  const SECTIONS = [
    { key: 'crashes', label: '崩溃', hint: '按指纹聚合;标记后同指纹的重现不再刷屏' },
    { key: 'logs', label: '错误日志', hint: 'error / fatal 级,按签名聚合' },
    { key: 'bugs', label: 'Bug 反馈', hint: '你在各 app 手动提交的 Report a bug' },
  ]

  let showResolved = $state({ crashes: false, logs: false, bugs: false })

  function pk(issue) {
    return `${issue.issueType}:${issue.issueKey}`
  }
  const isPending = (issue) => DIAG.pending.has(pk(issue))

  const STATUS_LABEL = { open: '未处理', resolved: '已解决', ignored: '已忽略' }
</script>

<div class="control-page">
  <header class="control-page-header">
    <div>
      <p class="control-page-kicker">Diagnostics</p>
      <h1>诊断 · Triage</h1>
      <p class="control-page-intro">
        崩溃、错误日志与 Bug 反馈集中在此。标注「已解决 / 忽略」后默认折叠,只留下真正待处理的。
      </p>
    </div>
    <button
      class="control-button"
      type="button"
      onclick={() => loadDiagnostics({ force: true })}
      disabled={DIAG.loading}
    >
      {DIAG.loading ? '刷新中…' : '刷新'}
    </button>
  </header>

  {#if DIAG.reason === 'unauthorized'}
    <div class="control-empty">
      <strong>需要登录</strong>
      诊断数据按账户归属,连接 Korben 账户后可查看。
    </div>
  {:else if DIAG.reason === 'offline'}
    <div class="control-empty"><strong>当前离线</strong> 恢复网络后重试。</div>
  {:else if DIAG.error && !model}
    <div class="control-empty"><strong>加载失败</strong> {DIAG.error}</div>
  {:else if model}
    {#if DIAG.error}
      <p class="control-notice" role="status">部分来源读取失败:{DIAG.error}</p>
    {/if}
    <p class="control-notice">
      待处理合计 <strong>{model.openTotal}</strong> · 崩溃 {model.crashes.openCount} ·
      日志 {model.logs.openCount} · Bug {model.bugs.openCount}
    </p>

    {#each SECTIONS as sec (sec.key)}
      {@const s = model[sec.key]}
      <section class="control-page-section">
        <h2>{sec.label} · 待处理 {s.openCount}</h2>
        <p class="control-notice">{sec.hint}</p>

        {#if !s.total}
          <div class="control-empty"><strong>没有 {sec.label}</strong> 这段很干净。</div>
        {:else}
          <div class="control-list">
            {#each s.open as issue (pk(issue))}
              <article class="control-row diag-row">
                <div class="control-row-main">
                  <div class="control-row-meta">
                    {#if sec.key !== 'bugs'}
                      <span class="control-badge diag-count">×{issue.count}</span>
                    {/if}
                    {#if issue.kind}<span>{issue.kind}</span>{/if}
                    {#if issue.level}<span class="control-badge control-badge--failed">{issue.level}</span>{/if}
                    {#if issue.app}<span>{issue.app}</span>{/if}
                    {#if issue.severity}<span>{issue.severity}</span>{/if}
                    <span>末次 {fmt(issue.lastSeen)}</span>
                    {#if issue.build}<span>build {issue.build}</span>{/if}
                  </div>
                  <h3>{issue.title}</h3>
                  {#if issue.message && issue.message !== issue.title}
                    <p class="control-row-detail">{issue.message}</p>
                  {/if}
                  <p class="control-row-detail diag-ctx">
                    {#if issue.ctxDomain}域 {issue.ctxDomain} · {/if}
                    {#if issue.ctxPath}{issue.ctxPath} · {/if}
                    {#if issue.route}{issue.route} · {/if}
                    {#if issue.device}{issue.device} · {/if}
                    首次 {fmt(issue.firstSeen)}
                  </p>
                  {#if issue.topFrames}
                    <pre class="diag-frames">{issue.topFrames}</pre>
                  {/if}
                </div>
                <div class="control-row-actions diag-actions">
                  <button
                    class="control-button"
                    type="button"
                    disabled={isPending(issue)}
                    onclick={() => markIssue(issue, 'resolved')}
                  >标为已解决</button>
                  <button
                    class="control-button diag-button-ghost"
                    type="button"
                    disabled={isPending(issue)}
                    onclick={() => markIssue(issue, 'ignored')}
                  >忽略</button>
                </div>
              </article>
            {/each}
          </div>

          {#if s.resolved.length}
            <button
              class="diag-toggle"
              type="button"
              onclick={() => (showResolved[sec.key] = !showResolved[sec.key])}
            >
              {showResolved[sec.key] ? '收起' : `已处理 ${s.resolved.length} 项`}
            </button>
            {#if showResolved[sec.key]}
              <div class="control-list diag-resolved">
                {#each s.resolved as issue (pk(issue))}
                  <article class="control-row diag-row diag-row--done">
                    <div class="control-row-main">
                      <div class="control-row-meta">
                        <span class="control-badge control-badge--success">{STATUS_LABEL[issue.status]}</span>
                        {#if sec.key !== 'bugs'}<span>×{issue.count}</span>{/if}
                        <span>末次 {fmt(issue.lastSeen)}</span>
                      </div>
                      <h3>{issue.title}</h3>
                      {#if issue.note}<p class="control-row-detail">备注:{issue.note}</p>{/if}
                    </div>
                    <div class="control-row-actions">
                      <button
                        class="control-button diag-button-ghost"
                        type="button"
                        disabled={isPending(issue)}
                        onclick={() => markIssue(issue, 'open')}
                      >重新打开</button>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .diag-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .diag-count {
    font-variant-numeric: tabular-nums;
  }
  .diag-ctx {
    opacity: 0.7;
    font-size: 0.82rem;
  }
  .diag-frames {
    margin: 8px 0 0;
    padding: 8px 10px;
    max-height: 140px;
    overflow: auto;
    background: var(--surface-2, rgba(127, 127, 127, 0.08));
    border-radius: 8px;
    font-size: 0.74rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .diag-button-ghost {
    background: none;
    border: 1px solid var(--border-l, rgba(127, 127, 127, 0.25));
    color: var(--t2, inherit);
  }
  .diag-toggle {
    margin-top: 10px;
    padding: 4px 2px;
    background: none;
    border: none;
    color: var(--t2, #6b7280);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .diag-toggle:hover {
    color: var(--accent, inherit);
  }
  .diag-resolved {
    margin-top: 8px;
    opacity: 0.75;
  }
  .diag-row--done h3 {
    text-decoration: line-through;
    text-decoration-color: var(--border-l, rgba(127, 127, 127, 0.4));
  }
</style>
