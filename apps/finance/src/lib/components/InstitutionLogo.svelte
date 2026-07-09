<script>
  // Port of src/components/InstitutionLogo.tsx.
  import { institutionLogoSrc, resolveInstitutionMetaFrom } from '$lib/institutionLogos.js'

  /** @type {{ name?: string, accountType?: string, issuer?: string, billLabel?: string, source?: string, size?: 'sm'|'md'|'lg'|'xl', class?: string }} */
  let { name, accountType, issuer, billLabel, source, size = 'md', class: klass = '' } = $props()

  const SIZE_PX = { sm: 20, md: 28, lg: 40, xl: 48 }

  const meta = $derived(
    resolveInstitutionMetaFrom({ name, accountType, issuer, billLabel, source }),
  )
  const px = $derived(SIZE_PX[size])
  const src = $derived(institutionLogoSrc(meta.id))

  function onImgError(e) {
    const img = e.currentTarget
    img.style.display = 'none'
    const fallback = img.nextElementSibling
    if (fallback instanceof HTMLElement) fallback.style.display = 'flex'
  }
</script>

<span
  class="institution-logo institution-logo--{size}{klass ? ` ${klass}` : ''}"
  style="width: {px}px; height: {px}px; --brand: {meta.color}"
  title={meta.label}
  aria-hidden="true"
>
  <img src={src} alt="" width={px} height={px} loading="lazy" onerror={onImgError} />
  <span class="institution-logo-fallback" style="background: {meta.color}; display: none" aria-hidden="true">
    {meta.initials || meta.label.slice(0, 1)}
  </span>
</span>
