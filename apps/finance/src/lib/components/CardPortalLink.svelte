<script>
  // Port of src/components/CardPortalLink.tsx.
  import InstitutionLogo from './InstitutionLogo.svelte'

  /** @type {{ portal: import('../cardPortals.js').CardPortal, compact?: boolean, showLogo?: boolean }} */
  let { portal, compact = false, showLogo = true } = $props()

  const label = $derived(compact ? '付款' : portal.appPreferred ? '登录（App 付款）' : '登录 / 付款')
  const title = $derived(`在 ${portal.issuer} 官网${portal.appPreferred ? '登录（付款请用 App）' : '登录或付款'}`)
</script>

<span class="portal-link-wrap">
  {#if showLogo}
    <InstitutionLogo issuer={portal.issuer} size="sm" />
  {/if}
  <a
    class="portal-link"
    href={portal.url}
    target="_blank"
    rel="noopener noreferrer"
    {title}
    onclick={(e) => e.stopPropagation()}
  >
    {label}
  </a>
</span>
