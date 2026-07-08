<script>
  import { page } from '$app/state'
  import { applyDocumentMetaWeb } from '../../index.js'
  import {
    LIFE_OS_SITE_META,
    LIFE_OS_ROBOTS,
    formatDocumentTitle,
    getSiteDescription,
    getOgLocale,
    absoluteUrl,
  } from '@life-os/theme'

  /** @typedef {import('@life-os/contracts/meta').PageMetadata} PageMetadata */
  /** @typedef {import('@life-os/contracts/appearance').BrandThemeID} BrandThemeID */

  /** @type {{ appId: BrandThemeID, pageTitle: string, locale?: string, imagePath?: string }} */
  let { appId, pageTitle, locale = 'zh', imagePath = '/icon.svg' } = $props()

  /** @type {PageMetadata} */
  const pageMetadata = $derived({
    appId,
    title: pageTitle,
    locale,
  })

  const app = $derived(LIFE_OS_SITE_META[appId])
  const documentTitle = $derived(formatDocumentTitle(pageTitle, app.name))
  const description = $derived(getSiteDescription(appId, locale))
  const canonical = $derived(absoluteUrl(page.url.origin, page.url.pathname))
  const ogImage = $derived(absoluteUrl(page.url.origin, imagePath))
  const ogLocale = $derived(getOgLocale(locale))
  const ogLocaleAlt = $derived(ogLocale === 'zh_CN' ? 'en_US' : 'zh_CN')

  $effect(() => {
    applyDocumentMetaWeb(pageMetadata, {
      pathname: page.url.pathname,
      imagePath,
    })
  })
</script>

<svelte:head>
  <title>{documentTitle}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={LIFE_OS_ROBOTS} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={app.name} />
  <meta property="og:title" content={documentTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:locale" content={ogLocale} />
  <meta property="og:locale:alternate" content={ogLocaleAlt} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:alt" content={app.name} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={documentTitle} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>
