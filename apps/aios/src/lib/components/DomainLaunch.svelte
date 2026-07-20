<script>
  /**
   * Legacy /spaces/{domain} routes: leave Kenos for the real domain app (same tab).
   * No bridge diagnostics UI — bookmarks still work without empty placeholders.
   */
  import { onMount } from 'svelte'
  import { rememberExternalResume } from '$lib/kenos/spaceSwitcher.svelte.js'
  import { domainDeepLink } from '$lib/kenos/domainResume.core.js'

  /**
   * @type {{
   *   domainId: 'plan' | 'money' | 'training' | 'music' | 'home' | 'knowledge',
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

  const href = $derived(domainDeepLink(domainId, path))

  onMount(() => {
    rememberExternalResume(listKey, {
      lastRoute: href,
      filter: filter || title,
    })
    window.location.assign(href)
  })
</script>

<div class="launch" data-testid={`domain-launch-${domainId}`} role="status">
  <p>
    正在打开 {title}…
    <a href={href}>若未自动跳转，点此继续</a>
  </p>
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
</style>
