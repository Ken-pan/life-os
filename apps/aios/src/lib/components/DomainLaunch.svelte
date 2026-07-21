<script>
  /**
   * Legacy /spaces/{domain} routes: leave Kenos for the real domain app (same tab).
   * Probe Continuity origin first so domains never sit forever on “Opening…”.
   */
  import { onMount } from 'svelte'
  import { rememberExternalResume } from '$lib/kenos/spaceSwitcher.svelte.js'
  import {
    domainDeepLink,
    isLocalDailyBeta,
    rewriteLoopbackToPageHost,
  } from '$lib/kenos/domainResume.core.js'

  /**
   * @type {{
   *   domainId: 'plan' | 'money' | 'training' | 'music' | 'home' | 'knowledge' | 'library' | 'health',
   *   listKey: string,
   *   title: string,
   *   path?: string,
   *   filter?: string,
   * }}
   */
  let {
    domainId,
    listKey,
    title,
    path = '/',
    filter = '',
  } = $props()

  /** library is the frozen domain id; deep-link helper still keys knowledge for the app origin. */
  const deepLinkId = $derived(domainId === 'library' ? 'knowledge' : domainId)
  const href = $derived(rewriteLoopbackToPageHost(domainDeepLink(deepLinkId, path)))

  /** @type {'probing' | 'opening' | 'unavailable'} */
  let phase = $state('probing')
  let detail = $state('')

  /**
   * @param {string} url
   * @param {number} ms
   */
  async function probeOrigin(url, ms = 1800) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      // no-cors: we only care that something answered on the LAN port
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: ctrl.signal,
      })
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  onMount(() => {
    rememberExternalResume(listKey, {
      lastRoute: href,
      filter: filter || title,
    })

    let cancelled = false
    ;(async () => {
      const daily = isLocalDailyBeta()
      const ok = await probeOrigin(href)
      if (cancelled) return
      if (!ok && daily) {
        phase = 'unavailable'
        detail = `${title} 本地 Continuity 端口当前不可达。请先 \`scripts/kenos-daily-beta/kenos-ctl.sh start\`（含 money/library/music/home/health companions），或打开生产站。`
        return
      }
      phase = 'opening'
      window.location.assign(href)
    })()

    return () => {
      cancelled = true
    }
  })
</script>

<div class="launch" data-testid={`domain-launch-${domainId}`} role="status">
  {#if phase === 'unavailable'}
    <p class="title">{title} 暂不可 Continuity</p>
    <p class="detail">{detail}</p>
    <div class="actions">
      <a class="primary" href="/spaces">‹ 返回 Spaces</a>
      <a href={href} rel="noopener">仍尝试打开</a>
    </div>
  {:else}
    <p>
      {phase === 'probing' ? `正在检查 ${title}…` : `正在打开 ${title}…`}
      <a href={href}>若未自动跳转，点此继续</a>
    </p>
  {/if}
</div>

<style>
  .launch {
    width: min(100% - 32px, 420px);
    margin: 48px auto;
    padding: 0 0 var(--kenos-mobile-bottom-pad, 96px);
    color: var(--t2);
    font-size: var(--kenos-type-body);
    line-height: var(--kenos-leading-body);
    text-align: center;
  }
  .launch a {
    display: inline-block;
    margin-top: 12px;
    color: var(--t1);
  }
  .title {
    margin: 0;
    color: var(--t1);
    font-size: var(--kenos-type-section, 18px);
    font-weight: 600;
  }
  .detail {
    margin: 12px 0 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: center;
    margin-top: 8px;
  }
  .actions .primary {
    font-weight: 600;
  }
</style>
